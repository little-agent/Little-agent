import os
import httpx
from pathlib import Path
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Prediction Market Landing Page")

PORTAL_DIST = Path(__file__).parent / "dist"
DASHBOARD_URL = "http://185.217.127.99:1409"

# Proxy GET requests to /api/prediction-market/* to the dashboard backend
@app.get("/api/prediction-market/{rest_of_path:path}")
async def proxy_prediction_market(rest_of_path: str, request: Request):
    query_params = dict(request.query_params)
    url = f"{DASHBOARD_URL}/api/prediction-market/{rest_of_path}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=query_params, timeout=10.0)
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")

# Serve static assets
if (PORTAL_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=PORTAL_DIST / "assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_portal(full_path: str):
    file_path = PORTAL_DIST / full_path
    if (
        full_path
        and file_path.resolve().is_relative_to(PORTAL_DIST.resolve())
        and file_path.exists()
        and file_path.is_file()
    ):
        return FileResponse(file_path)
    
    # Fallback to index.html
    index_html = PORTAL_DIST / "index.html"
    if index_html.exists():
        return HTMLResponse(
            content=index_html.read_text(),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
        )
    return HTMLResponse("Prediction Market Portal dist not found. Run npm run build in portal directory.", status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=1410)
