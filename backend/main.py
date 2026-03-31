import os
import sys

# Check if the application is running
print("Starting the application...")
print("=== MAIN.PY LOADED ===")

# Check if all imports are working
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi import Request
    from fastapi.responses import JSONResponse
    import logging
    print("All imports are working correctly.")
except Exception as e:
    print(f"Error during imports: {e}")
    sys.exit(1)


# Initialize the app
try:
    app = FastAPI(title="Property Management API", version="1.0.0", debug=True)
    print("FastAPI app initialized successfully.")

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    print("CORS middleware enabled for all origins (development mode)")
except Exception as e:
    print(f"Error initializing FastAPI app: {e}")
    sys.exit(1)

# # Global exception handler to log all errors
# @app.exception_handler(Exception)
# async def global_exception_handler(request: Request, exc: Exception):
#     print(f"Global exception handler caught: {exc}")
#     import traceback
#     traceback.print_exc()
#     logging.error(f"Unhandled error: {exc}", exc_info=True)
#     return JSONResponse(
#         status_code=500,
#         content={"detail": str(exc)},
#     )

# Uncomment the router inclusions
try:
    from routes.auth_routes import router as auth_router
    print("Auth router imported successfully")
except Exception as e:
    print(f"Error importing auth router: {e}")
    auth_router = None

try:
    from routes.user_routes import router as user_router
    print("User router imported successfully")
except Exception as e:
    print(f"Error importing user router: {e}")
    user_router = None

try:
    from routes.apartment_routes import router as apartment_router
    print("Apartment router imported successfully")
except Exception as e:
    print(f"Error importing apartment router: {e}")
    apartment_router = None

try:
    from routes.building_routes import router as building_router
    print("Building router imported successfully")
except Exception as e:
    print(f"Error importing building router: {e}")
    building_router = None

try:
    from routes.payment_routes import router as payment_router
    print("Payment router imported successfully")
except Exception as e:
    print(f"Error importing payment router: {e}")
    payment_router = None

try:
    from routes.contract_routes import router as contract_router
    print("Contract router imported successfully")
except Exception as e:
    print(f"Error importing contract router: {e}")
    contract_router = None

try:
    from routes.maintenance_routes import router as maintenance_router
    print("Maintenance router imported successfully")
except Exception as e:
    print(f"Error importing maintenance router: {e}")
    maintenance_router = None

try:
    from routes.document_routes import router as document_router
    print("Document router imported successfully")
except Exception as e:
    print(f"Error importing document router: {e}")
    document_router = None

try:
    from routes.notification_routes import router as notification_router
    print("Notification router imported successfully")
except Exception as e:
    print(f"Error importing notification router: {e}")
    notification_router = None

if auth_router:
    app.include_router(auth_router, prefix="", tags=["auth"])
    print("Auth router included - routes:", [route.path for route in auth_router.routes])
if user_router:
    app.include_router(user_router, prefix="/users", tags=["users"])
if apartment_router:
    app.include_router(apartment_router, prefix="/api", tags=["apartments"])
if building_router:
    app.include_router(building_router, prefix="/api", tags=["buildings"])
if payment_router:
    app.include_router(payment_router, prefix="/api", tags=["payments"])
if contract_router:
    app.include_router(contract_router, prefix="/api", tags=["contracts"])
if maintenance_router:
    app.include_router(maintenance_router, prefix="/api", tags=["maintenance"])
if document_router:
    app.include_router(document_router, prefix="/api", tags=["documents"])
if notification_router:
    app.include_router(notification_router, prefix="/api", tags=["notifications"])

@app.get("/")
async def root():
    return {"message": "Property Management API"}

@app.options("/")
async def options_root():
    from fastapi.responses import Response
    response = Response(content='{"message": "OPTIONS handled"}', media_type="application/json")
    response.headers["Access-Control-Allow-Origin"] = "http://127.0.0.1:5500"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.post("/test")
async def test_endpoint():
    print("Direct test endpoint called")
    return {"message": "Direct test successful"}

print("Test endpoint defined")

@app.get("/testget")
async def test_get_endpoint():
    print("Direct GET test endpoint called")
    return {"message": "Direct GET test successful"}

print("Test GET endpoint defined")

print("App routes:", [route.path for route in app.routes])