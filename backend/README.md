# Property Management Backend

This is the backend for the Property Management application, built with FastAPI and Supabase.

## Setup

1. Install Python 3.8+ from https://python.org

2. Set up Supabase:
   - Create a new project at https://supabase.com
   - Go to Settings > API to get your URL and anon key
   - Go to SQL Editor and run the SQL from `database_setup.sql` to create tables

3. Clone or navigate to the backend directory

4. Create virtual environment:
   ```
   python -m venv venv
   ```

5. Activate virtual environment:
   - Windows: `venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`

6. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

7. Create `.env` file with your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   SECRET_KEY=your_random_secret_key
   ```

8. Run the server:
   ```
   uvicorn main:app --reload
   ```

The API will be available at http://localhost:8000

## API Endpoints

- **Auth:**
  - POST /auth/register - Register a new user
  - POST /auth/login - Login

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

Update the JavaScript files to use the API instead of localStorage. Examples updated in login.js and register.js.

Change `API_BASE` to your production URL when deploying.