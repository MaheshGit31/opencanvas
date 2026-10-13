"""Reference AI server for OpenCanvas. Optional. Run: pip install -r requirements.txt && uvicorn server:app --port 8787
Point OpenCanvas at http://localhost:8787 under Settings, AI. Every model is optional; endpoints answer 501 if its package is missing.

Who can use the server is set by PUBLIC_SERVER_ACCESS (PUBLIC-SERVER-ACCESS also works)
  NONE     only requests with your key (OPENCANVAS_KEY) get in. This is the default when blank or unknown
  LIMITED  anyone can use light tools within per IP and global limits. Heavy tools need your key
  FULL     anyone can use everything with no limits
A request carrying your key is never limited."""
import io, os, time, hmac, collections, threading
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

KEY = os.environ.get("OPENCANVAS_KEY", "")
_raw = os.environ.get("PUBLIC_SERVER_ACCESS") or os.environ.get("PUBLIC-SERVER-ACCESS") or ""
ACCESS = _raw.strip().upper() if _raw.strip().upper() in ("NONE", "LIMITED", "FULL") else "NONE"
if _raw.strip() and ACCESS == "NONE" and _raw.strip().upper() != "NONE":
    print(f"PUBLIC_SERVER_ACCESS '{_raw}' is not NONE, LIMITED or FULL. Using NONE")

def num(name, d): 
    try: return float(os.environ.get(name, d))
    except ValueError: return float(d)
PER_MIN = int(num("LIMITED_PER_MINUTE", 6))
PER_DAY = int(num("LIMITED_PER_DAY", 60))
GLOBAL_DAY = int(num("LIMITED_GLOBAL_PER_DAY", 1500))
LIMITED_MB = num("LIMITED_MAX_MB", 4)
FULL_MB = num("FULL_MAX_MB", 25)
HEAVY = {"generate-bg"}  # needs the owner key unless access is FULL

app = FastAPI(title="OpenCanvas AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_hits = collections.defaultdict(collections.deque); _day = collections.deque(); _lock = threading.Lock()

def is_owner(authorization):
    return bool(KEY) and hmac.compare_digest((authorization or "").encode(), ("Bearer " + KEY).encode())

def client_ip(req):
    xf = req.headers.get("x-forwarded-for", "")
    return (xf.split(",")[-1].strip() if xf else (req.client.host if req.client else "?"))

def deny(status, code, msg, retry=None):
    h = {"Retry-After": str(int(retry))} if retry else None
    raise HTTPException(status, {"code": code, "message": msg}, headers=h)

def gate(tool):
    async def dep(request: Request, authorization: str = Header(None)):
        request.state.owner = owner = is_owner(authorization)
        request.state.limit_mb = FULL_MB
        if owner: return
        if ACCESS == "NONE":
            deny(403, "server_private", "This server is private. Add the owner's key in Settings, AI")
        if ACCESS == "FULL": return
        if tool in HEAVY: deny(403, "owner_only", "This tool is not open on this server")
        request.state.limit_mb = LIMITED_MB
        cl = request.headers.get("content-length")
        if cl and int(cl) > LIMITED_MB * 1048576 * 2: deny(413, "too_big", f"Files are limited to {LIMITED_MB:g} MB here")
        now = time.time(); ip = client_ip(request)
        with _lock:
            while _day and now - _day[0] > 86400: _day.popleft()
            q = _hits[ip]
            while q and now - q[0] > 86400: q.popleft()
            if len(_hits) > 5000:
                for k in [k for k, v in _hits.items() if not v]: _hits.pop(k, None)
            if len(_day) >= GLOBAL_DAY: deny(429, "busy", "This server hit its daily limit. Try again tomorrow", 3600)
            if len(q) >= PER_DAY: deny(429, "daily_limit", "You used today's free runs on this server", 3600)
            recent = [t for t in q if now - t < 60]
            if len(recent) >= PER_MIN: deny(429, "slow_down", "Too fast. Wait a moment and try again", 60 - (now - recent[0]))
            q.append(now); _day.append(now)
    return dep

async def read(f, request):
    data = await f.read(int(request.state.limit_mb * 1048576) + 1)
    if len(data) > request.state.limit_mb * 1048576: deny(413, "too_big", f"Files are limited to {request.state.limit_mb:g} MB here")
    return data

@app.exception_handler(HTTPException)
async def http_err(request, exc):
    d = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse(d, status_code=exc.status_code, headers=getattr(exc, "headers", None))

def png(img):
    b = io.BytesIO(); img.save(b, "PNG"); return Response(b.getvalue(), media_type="image/png")

@app.get("/v1/health")
def health(authorization: str = Header(None)):
    owner = is_owner(authorization)
    return {"ok": True, "access": "OWNER" if owner else ACCESS, "heavy": owner or ACCESS == "FULL"}

@app.post("/v1/remove-bg", dependencies=[Depends(gate("remove-bg"))])
async def remove_bg(request: Request, image: UploadFile = File(...)):
    try: from rembg import remove
    except ImportError: raise HTTPException(501, "pip install rembg")
    return png(remove(Image.open(io.BytesIO(await read(image, request))).convert("RGBA")))

@app.post("/v1/inpaint", dependencies=[Depends(gate("inpaint"))])
async def inpaint(request: Request, image: UploadFile = File(...), mask: UploadFile = File(...)):
    try: import cv2, numpy as np
    except ImportError: raise HTTPException(501, "pip install opencv-python-headless numpy")
    img = cv2.cvtColor(np.array(Image.open(io.BytesIO(await read(image, request))).convert("RGB")), cv2.COLOR_RGB2BGR)
    m = np.array(Image.open(io.BytesIO(await read(mask, request))).convert("RGBA"))[:, :, 3]
    m = cv2.dilate((m > 40).astype("uint8") * 255, np.ones((7, 7), np.uint8))
    out = cv2.inpaint(img, m, 5, cv2.INPAINT_TELEA)
    return png(Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)))

@app.post("/v1/ocr", dependencies=[Depends(gate("ocr"))])
async def ocr(request: Request, image: UploadFile = File(...)):
    try: import pytesseract
    except ImportError: raise HTTPException(501, "pip install pytesseract and install tesseract")
    d = pytesseract.image_to_data(Image.open(io.BytesIO(await read(image, request))), output_type=pytesseract.Output.DICT)
    lines = {}
    for i, t in enumerate(d["text"]):
        if t.strip() and float(d["conf"][i]) > 50:
            k = (d["block_num"][i], d["par_num"][i], d["line_num"][i]); x, y, w, h = d["left"][i], d["top"][i], d["width"][i], d["height"][i]
            L = lines.setdefault(k, {"text": "", "x0": x, "y0": y, "x1": x + w, "y1": y + h})
            L["text"] += (" " if L["text"] else "") + t; L["x0"] = min(L["x0"], x); L["y0"] = min(L["y0"], y); L["x1"] = max(L["x1"], x + w); L["y1"] = max(L["y1"], y + h)
    return {"lines": list(lines.values())}

@app.post("/v1/generate-bg", dependencies=[Depends(gate("generate-bg"))])
async def generate_bg(request: Request, prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024)):
    try:
        import torch
        from diffusers import AutoPipelineForText2Image
    except ImportError: raise HTTPException(501, "pip install torch diffusers")
    pipe = getattr(app.state, "pipe", None)
    if pipe is None:
        pipe = AutoPipelineForText2Image.from_pretrained(os.environ.get("OPENCANVAS_T2I", "stabilityai/sdxl-turbo"), torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
        pipe.to("cuda" if torch.cuda.is_available() else "cpu"); app.state.pipe = pipe
    w, h = (min(width, 1024) // 8 * 8, min(height, 1024) // 8 * 8)
    return png(pipe(prompt=prompt + ", background, no text", width=w, height=h, num_inference_steps=4, guidance_scale=0.0).images[0])

@app.post("/v1/translate", dependencies=[Depends(gate("translate"))])
async def translate(request: Request, text: str = Form(...), to: str = Form("es")):
    if len(text) > 5000 and not request.state.owner and ACCESS != "FULL": deny(413, "too_big", "Text is limited to 5000 characters here")
    try: import argostranslate.translate as T
    except ImportError: raise HTTPException(501, "pip install argostranslate")
    return JSONResponse({"text": T.translate(text, "en", to)})

# Serve the app from the same server so one Railway service hosts everything
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(ROOT, "index.html")) and os.environ.get("SERVE_APP", "1") != "0":
    for d in ("css", "js", "vendor", "sdk", "community"):
        if os.path.isdir(os.path.join(ROOT, d)): app.mount("/" + d, StaticFiles(directory=os.path.join(ROOT, d)), name=d)
    for f in ("sw.js", "manifest.webmanifest", "icon.svg"):
        app.add_api_route("/" + f, (lambda f=f: FileResponse(os.path.join(ROOT, f))), methods=["GET"], include_in_schema=False)
    app.add_api_route("/", lambda: FileResponse(os.path.join(ROOT, "index.html")), methods=["GET"], include_in_schema=False)
