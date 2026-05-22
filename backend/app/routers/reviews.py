from fastapi import APIRouter, Query

from app.mongo_models.review import get_car_reviews


router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/car/{car_id}")
async def list_car_reviews(
    car_id: str,
    rating: int | None = Query(default=None, ge=1, le=5),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=20),
):
    return await get_car_reviews(car_id, page=page, limit=limit, rating=rating)
