from fastapi import FastAPI
from users.auth import router as user_router
from clients.manage_clients import router as client_router
from MultiBroker_Router import router as trading_router

app = FastAPI()

app.include_router(user_router, prefix="/users", tags=["users"])
app.include_router(client_router, prefix="/clients", tags=["clients"])
app.include_router(trading_router, prefix="/trade", tags=["trade"])
