from sqlalchemy.orm import Session
from sqlalchemy import func

from . import models, schemas

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    db_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_transactions(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Transaction).filter(models.Transaction.owner_id == user_id).offset(skip).limit(limit).all()

def create_transaction(db: Session, transaction: schemas.TransactionCreate, user_id: int):
    db_transaction = models.Transaction(**transaction.dict(), owner_id=user_id)
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def get_transaction(db: Session, transaction_id: int, user_id: int):
    return db.query(models.Transaction).filter(models.Transaction.id == transaction_id, models.Transaction.owner_id == user_id).first()

def update_transaction(db: Session, transaction_id: int, transaction: schemas.TransactionCreate, user_id: int):
    db_transaction = get_transaction(db, transaction_id, user_id)
    if db_transaction:
        for key, value in transaction.dict().items():
            setattr(db_transaction, key, value)
        db.commit()
        db.refresh(db_transaction)
    return db_transaction

def delete_transaction(db: Session, transaction_id: int, user_id: int):
    db_transaction = get_transaction(db, transaction_id, user_id)
    if db_transaction:
        db.delete(db_transaction)
        db.commit()
    return db_transaction

def get_categories(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Category).filter(models.Category.owner_id == user_id).offset(skip).limit(limit).all()

def create_category(db: Session, category: schemas.CategoryCreate, user_id: int):
    db_category = models.Category(**category.dict(), owner_id=user_id)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def get_category(db: Session, category_id: int, user_id: int):
    return db.query(models.Category).filter(models.Category.id == category_id, models.Category.owner_id == user_id).first()

def get_spending_by_category(db: Session, user_id: int):
    return (
        db.query(
            models.Category.name,
            func.sum(models.Transaction.amount).label("total_spending"),
        )
        .join(models.Transaction, models.Category.id == models.Transaction.category_id)
        .filter(models.Transaction.owner_id == user_id)
        .filter(models.Transaction.type == "expense")
        .group_by(models.Category.name)
        .all()
    )
