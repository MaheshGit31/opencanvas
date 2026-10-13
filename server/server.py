"""Reference AI server for OpenCanvas. Optional. Run: pip install -r requirements.txt && uvicorn server:app --port 8787
Point OpenCanvas at http://localhost:8787 under Settings, AI. Every model is optional; endpoints answer 501 if its package is missing."""
import io, os
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from PIL import Image

KEY = os.environ.get("OPENCANVAS_KEY", "")
app = FastAPI(title="OpenCanvas AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def auth(authorization):
    if KEY and authorization != "Bearer " + KEY:
        raise HTTPException(401, "Wrong key")

def png(img):
    b = io.BytesIO(); img.save(b, "PNG"); return Response(b.getvalue(), media_type="image/png")

@app.get("/v1/health")
def health(): return {"ok": True}

@app.post("/v1/remove-bg")
async def remove_bg(image: UploadFile = File(...), authorization: str = Header(None)):
    auth(authorization)
    try: from rembg import remove
    except ImportError: raise HTTPException(501, "pip install rembg")
    return png(remove(Image.open(io.BytesIO(await image.read())).convert("RGBA")))

@app.post("/v1/inpaint")
async def inpaint(image: UploadFile = File(...), mask: UploadFile = File(...), authorization: str = Header(None)):
    auth(authorization)
    try: import cv2, numpy as np
    except ImportError: raise HTTPException(501, "pip install opencv-python-headless numpy")
    img = cv2.cvtColor(np.array(Image.open(io.BytesIO(await image.read())).convert("RGB")), cv2.COLOR_RGB2BGR)
    m = np.array(Image.open(io.BytesIO(await mask.read())).convert("RGBA"))[:, :, 3]
    m = cv2.dilate((m > 40).astype("uint8") * 255, np.ones((7, 7), np.uint8))
    out = cv2.inpaint(img, m, 5, cv2.INPAINT_TELEA)
    return png(Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)))

@app.post("/v1/ocr")
async def ocr(image: UploadFile = File(...), authorization: str = Header(None)):
    auth(authorization)
    try: import pytesseract
    except ImportError: raise HTTPException(501, "pip install pytesseract and install tesseract")
    d = pytesseract.image_to_data(Image.open(io.BytesIO(await image.read())), output_type=pytesseract.Output.DICT)
    lines = {}
    for i, t in enumerate(d["text"]):
        if t.strip() and float(d["conf"][i]) > 50:
            k = (d["block_num"][i], d["par_num"][i], d["line_num"][i]); x, y, w, h = d["left"][i], d["top"][i], d["width"][i], d["height"][i]
            L = lines.setdefault(k, {"text": "", "x0": x, "y0": y, "x1": x + w, "y1": y + h})
            L["text"] += (" " if L["text"] else "") + t; L["x0"] = min(L["x0"], x); L["y0"] = min(L["y0"], y); L["x1"] = max(L["x1"], x + w); L["y1"] = max(L["y1"], y + h)
    return {"lines": list(lines.values())}

@app.post("/v1/generate-bg")
async def generate_bg(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024), authorization: str = Header(None)):
    auth(authorization)
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

@app.post("/v1/translate")
async def translate(text: str = Form(...), to: str = Form("es"), authorization: str = Header(None)):
    auth(authorization)
    try: import argostranslate.translate as T
    except ImportError: raise HTTPException(501, "pip install argostranslate")
    return JSONResponse({"text": T.translate(text, "en", to)})
