# Property Management Backend

This is the backend for the Property Management application, built with FastAPI and Supabase.

## Setup

1. Install **Python 3.12+** from https://www.python.org (3.14 is supported with the pinned dependencies in `requirements.txt`).

2. Set up Supabase:
   - Create a new project at https://supabase.com
   - Go to Settings > API to get your URL and anon key
   - Go to SQL Editor and run the SQL from `database_setup.sql` to create tables

3. Clone the repo and open a terminal in this **`backend`** directory.

4. Create a virtual environment named **`venv312`** (matches `restart-server.ps1` and keeps the repo layout consistent):
   ```
   python -m venv venv312
   ```

5. Activate the virtual environment:
   - Windows (PowerShell): `.\venv312\Scripts\Activate.ps1`
   - Windows (cmd): `venv312\Scripts\activate.bat`
   - Linux/Mac: `source venv312/bin/activate`

6. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

7. Create a **`.env`** file in **`backend`** (same folder as `main.py`) with your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   SECRET_KEY=your_random_secret_key
   ```

8. Run the server on **port 8002** (used by the frontend in this project):
   ```
   uvicorn main:app --reload --host 127.0.0.1 --port 8002 --reload-exclude venv312
   ```
   The `--reload-exclude venv312` flag avoids the auto-reloader watching your virtualenv on Windows.

   **Windows (PowerShell):** you can use `.\restart-server.ps1` from this directory instead; it uses `venv312` and passes the reload exclude for you.

The API will be available at http://127.0.0.1:8002 (and interactive docs at http://127.0.0.1:8002/docs).

**Note:** `venv312/` is not committed to Git. Each developer creates their own virtual environment after cloning.

## API Endpoints

- **Auth:**
  - POST /register - Register a new user
  - POST /login or POST /api/login - Login

- **Users:**
  - GET /users/me - Get current user
  - PUT /users/me - Update user

- **Apartments:**
  - POST /api/apartments - Create apartment (owners only)
  - GET /api/apartments - Get apartments

- **Payment installments (schedule):**
  - GET /api/contracts/{contract_id}/installments - List installments
  - POST /api/contracts/{contract_id}/installments/generate - Generate schedule (owner)
  - PATCH /api/payment-installments/{installment_id} - Update installment (mark paid, etc.)

- **Contracts:**
  - POST /api/contracts - Create contract
  - GET /api/contracts - Get contracts

- **Maintenance:**
  - POST /api/maintenance - Create maintenance request
  - GET /api/maintenance - Get maintenance requests
  - PUT /api/maintenance/{id} - Update maintenance request status

- **Documents:**
  - POST /api/documents - Upload document
  - GET /api/documents - Get user's documents

- **Notifications:**
  - GET /api/notifications - Get notifications
  - PUT /api/notifications/{id}/read - Mark as read

## Connecting Frontend

Point the frontend’s `API_BASE` (or equivalent) at this backend, e.g. `http://127.0.0.1:8002` during local development.

Change `API_BASE` to your production URL when deploying.