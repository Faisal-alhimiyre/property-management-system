# Deployment Guide

## Stack
- Frontend: Netlify (static files)
- Backend: Render (FastAPI)
- Database/Storage: Supabase

## 1) Backend on Render
1. Push this repo to GitHub.
2. In Render, create a Web Service from the repo.
3. Render settings:
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_KEY`
   - `SUPABASE_DOCS_BUCKET=documents`
   - SMTP / Resend variables used in your `.env`
   - `CORS_ORIGINS=https://<your-netlify-domain>,http://127.0.0.1:5500,http://localhost:5500`

## 2) Frontend on Netlify
1. In Netlify, create site from the same repo.
2. Build settings:
   - Publish directory: `.`
   - Build command: (empty)
3. Set production API URL by adding this in Netlify site header injection or inline script before `auth.js`:
   - `window.__WALAJNA_API_BASE = "https://<your-render-domain>";`

Alternative (runtime from browser dev console):
`localStorage.setItem("walajna_api_base", "https://<your-render-domain>")`

## 3) Supabase storage
1. Create bucket named `documents` in Storage (or change `SUPABASE_DOCS_BUCKET` to your bucket).
2. Keep bucket public for current app behavior.

## 4) Verify after deploy
1. Open frontend URL.
2. Login as owner.
3. Create building.
4. Open owner/apartments page.
5. Assign tenant.
6. Render/upload contract PDF.
