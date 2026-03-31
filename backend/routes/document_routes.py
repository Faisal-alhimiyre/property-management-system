from fastapi import APIRouter, Depends, HTTPException
from models import Document
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()

@router.post("/documents")
async def upload_document(document: Document, current_user: dict = Depends(get_current_user)):
    # Users can upload their own documents
    if document.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    document_data = document.dict()
    response = supabase.table("documents").insert(document_data).execute()
    return response.data[0]

@router.get("/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    documents = supabase.table("documents").select("*").eq("user_id", current_user["id"]).execute()
    return documents.data