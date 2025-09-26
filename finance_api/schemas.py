from pydantic import BaseModel, EmailStr
from typing import List, Optional

# Transaction Schemas
class TransactionBase(BaseModel):
    title: str
    amount: float
    type: str = "expense"
    category_id: int

class TransactionCreate(TransactionBase):
    pass

class Transaction(TransactionBase):
    id: int
    owner_id: int

    class Config:
        orm_mode = True

# Category Schemas
class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    owner_id: int
    transactions: List[Transaction] = []

    class Config:
        orm_mode = True

# User Schemas
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    transactions: List[Transaction] = []
    categories: List[Category] = []

    class Config:
        orm_mode = True

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
