import os
import re
import sys

# Check if the application is running
print("Starting the application...")
print("=== MAIN.PY LOADED ===")

# Check if all imports are working
try:
    from fastapi import FastAPI
    from fastapi import Request
    from fastapi.responses import JSONResponse, Response
    import logging
    print("All imports are working correctly.")
except Exception as e:
    print(f"Error during imports: {e}")
    sys.exit(1)

_cors_raw = os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5500,http://localhost:5500,"
    "http://127.0.0.1:8002,http://localhost:8002,"
    "http://127.0.0.1:3000,http://localhost:3000",
)
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
_cors_origin_regex = r"^http://(127\.0\.0\.1|localhost)(:\d+)?$"
_dev_origin_re = re.compile(_cors_origin_regex)

# Initialize the app
try:
    app = FastAPI(title="Property Management API", version="1.0.0", debug=True)
    print("FastAPI app initialized successfully.")
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
    from routes.auth_routes import router as auth_router, login_handler, logout_handler
    print("Auth router imported successfully")
except Exception as e:
    print(f"Error importing auth router: {e}")
    auth_router = None
    login_handler = None
    logout_handler = None

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

# Bind login on the app before include_router so POST /login is never overridden by another layer.
if login_handler is not None:
    app.add_api_route("/login", login_handler, methods=["POST"], tags=["auth"])
    app.add_api_route("/api/login", login_handler, methods=["POST"], tags=["auth"])
    print("Login bound on app: POST /login, POST /api/login")

if logout_handler is not None:
    app.add_api_route("/logout", logout_handler, methods=["POST"], tags=["auth"])
    app.add_api_route("/api/logout", logout_handler, methods=["POST"], tags=["auth"])
    print("Logout bound on app: POST /logout, POST /api/logout")

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


@app.middleware("http")
async def localhost_cors(request: Request, call_next):
    """
    Single CORS layer for local dev (Live Server + API on different ports).
    Echoes the request Origin so credentialed fetch always gets a matching ACAO header.
    """
    origin = (request.headers.get("origin") or "").strip()
    allowed = bool(origin and _dev_origin_re.match(origin))

    if request.method == "OPTIONS" and allowed:
        req_headers = request.headers.get("access-control-request-headers") or "*"
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
                "Access-Control-Allow-Headers": req_headers,
                "Access-Control-Max-Age": "86400",
            },
        )

    try:
        response = await call_next(request)
    except Exception:
        logging.exception("Unhandled exception (CORS recovery path)")
        if allowed:
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
                headers={
                    "access-control-allow-origin": origin,
                    "access-control-allow-credentials": "true",
                },
            )
        raise

    if allowed:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
    return response


print("CORS (localhost echo) enabled; allowlist also:", _cors_origins)
print("App routes:", [route.path for route in app.routes])