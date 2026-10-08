# CPU image for deploying the ML service (Fly.io, Railway, Render, Cloud Run...).
FROM python:3.12-slim
WORKDIR /srv
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the model weights into the image so containers start fast.
RUN python -c "from transformers import AutoModel, AutoProcessor; m='google/siglip-base-patch16-224'; AutoModel.from_pretrained(m); AutoProcessor.from_pretrained(m)"
COPY app ./app
# API by default; run the worker instead with: python -m app.worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
