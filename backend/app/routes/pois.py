from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional

from backend.app.database import get_db
from backend.app.models.poi import POI
from backend.app.schemas.poi import POIOut

router = APIRouter(prefix="/pois", tags=["POIs"])

@router.get("", response_model=List[POIOut])
def get_pois(
    category: Optional[str] = Query(None, description="Filter by category (e.g. police, hospital, pharmacy, restaurant, cafe, bus_stop, bank, fuel, bar, park)"),
    lat: Optional[float] = Query(None, description="Center latitude for proximity search"),
    lon: Optional[float] = Query(None, description="Center longitude for proximity search"),
    radius_meters: float = Query(5000.0, description="Search radius in meters"),
    limit: int = Query(200, ge=1, le=1000, description="Maximum number of POIs to return"),
    db: Session = Depends(get_db)
):
    """
    Retrieve POIs with optional category and proximity filtering.
    """
    if lat is not None and lon is not None:
        category_clause = "AND category = :category" if category else ""
        query_sql = f"""
            SELECT id, osm_id, name, category, latitude, longitude,
                   ST_Distance(geometry::geography, ST_MakePoint(:lon, :lat)::geography) as distance_meters
            FROM pois
            WHERE ST_DWithin(geometry::geography, ST_MakePoint(:lon, :lat)::geography, :radius)
            {category_clause}
            ORDER BY distance_meters ASC
            LIMIT :limit;
        """
        params = {"lat": lat, "lon": lon, "radius": radius_meters, "limit": limit}
        if category:
            params["category"] = category.lower()
        rows = db.execute(text(query_sql), params).fetchall()

        return [
            POIOut(
                id=r[0],
                osm_id=r[1],
                name=r[2],
                category=r[3],
                latitude=r[4],
                longitude=r[5],
                distance_meters=round(r[6], 1)
            )
            for r in rows
        ]
    else:
        query = db.query(POI)
        if category:
            query = query.filter(POI.category == category.lower())
        pois = query.limit(limit).all()
        return [
            POIOut(
                id=p.id,
                osm_id=p.osm_id,
                name=p.name,
                category=p.category,
                latitude=p.latitude,
                longitude=p.longitude
            )
            for p in pois
        ]

@router.get("/emergency")
def get_emergency_facilities(
    lat: float = Query(..., description="Current latitude"),
    lon: float = Query(..., description="Current longitude"),
    db: Session = Depends(get_db)
):
    """
    Returns the closest police station, hospital, and pharmacy with phone numbers / contact stubs for 1-tap emergency dial.
    """
    emergency_cats = ["police", "hospital", "pharmacy"]
    results = {}

    for cat in emergency_cats:
        sql = """
            SELECT id, name, category, latitude, longitude,
                   ST_Distance(geometry::geography, ST_MakePoint(:lon, :lat)::geography) as distance_meters
            FROM pois
            WHERE category = :category
            ORDER BY distance_meters ASC
            LIMIT 1;
        """
        row = db.execute(text(sql), {"cat": cat, "lat": lat, "lon": lon, "category": cat}).fetchone()
        if row:
            # Default helpline numbers in Nashik / Maharashtra
            phone = "112" if cat == "police" else ("108" if cat == "hospital" else "102")
            results[cat] = {
                "id": row[0],
                "name": row[1] or f"Nearest {cat.capitalize()}",
                "category": row[2],
                "latitude": row[3],
                "longitude": row[4],
                "distance_meters": round(row[5], 1),
                "distance_km": round(row[5] / 1000.0, 2),
                "phone": phone
            }

    return results

@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """
    Returns all POI categories with their counts in Nashik.
    """
    sql = "SELECT category, count(*) FROM pois GROUP BY category ORDER BY count(*) DESC;"
    rows = db.execute(text(sql)).fetchall()
    return [{"category": r[0], "count": r[1]} for r in rows]
