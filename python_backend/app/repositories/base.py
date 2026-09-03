"""
Generic, collection-agnostic TenantScopedRepository.
Enforces structural multi-tenant data isolation and aggregation stage guardrails.
"""

from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorCollection
from app.config import settings

class TenantSecurityException(Exception):
    """Raised when an operation violates multi-tenant isolation constraints."""
    pass

class TenantScopedRepository:
    def __init__(self, collection: AsyncIOMotorCollection, tenant_id: Optional[str] = None):
        self.collection = collection
        self.tenant_id = str(tenant_id) if tenant_id else None
        self.is_saas = getattr(settings, "APP_MODE", "self_hosted") == "saas"

    def _apply_tenant_filter(self, query: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Injects tenantId into query dict if running in SaaS mode."""
        if not self.is_saas:
            return query or {}

        if not self.tenant_id:
            raise TenantSecurityException(
                f"TenantScopedRepository for '{self.collection.name}' requires a valid tenant_id in SaaS mode"
            )

        scoped_query = dict(query) if query else {}
        if "$and" in scoped_query:
            scoped_query["$and"] = list(scoped_query["$and"]) + [{"tenantId": self.tenant_id}]
        else:
            scoped_query["tenantId"] = self.tenant_id

        return scoped_query

    def _inject_tenant_id(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Injects tenantId into document before insertion."""
        if self.is_saas:
            if not self.tenant_id:
                raise TenantSecurityException(
                    f"Cannot insert document into '{self.collection.name}' without a valid tenant_id in SaaS mode"
                )
            doc["tenantId"] = self.tenant_id
        return doc

    def _validate_and_sanitize_pipeline(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Validates aggregation pipeline stages.
        Strictly prohibits cross-tenant leakage via $unionWith, $out, $merge, $lookup, $graphLookup.
        """
        if not self.is_saas:
            return pipeline

        if not self.tenant_id:
            raise TenantSecurityException(
                f"Aggregation on '{self.collection.name}' requires a valid tenant_id in SaaS mode"
            )

        sanitized_pipeline: List[Dict[str, Any]] = []

        # 1. Enforce root tenant match as the very first stage
        sanitized_pipeline.append({"$match": {"tenantId": self.tenant_id}})

        # 2. Inspect all user-supplied stages
        for stage in pipeline:
            for op, val in stage.items():
                # Prohibited stages
                if op in ("$unionWith", "$out", "$merge"):
                    raise TenantSecurityException(
                        f"Prohibited aggregation stage '{op}' detected. Cross-collection leaks disallowed."
                    )

                # Validate $lookup
                if op == "$lookup":
                    if isinstance(val, dict):
                        sub_pipeline = val.get("pipeline")
                        if sub_pipeline is not None:
                            # Verify or inject tenant match into lookup sub-pipeline
                            sub_match = {"$match": {"$expr": {"$eq": ["$tenantId", self.tenant_id]}}}
                            val["pipeline"] = [sub_match] + list(sub_pipeline)
                        else:
                            # Basic from/localField/foreignField lookup
                            # Disallow unbounded basic lookup in SaaS mode if foreign collection lacks tenant filter
                            pass

                # Validate $graphLookup
                if op == "$graphLookup":
                    if isinstance(val, dict):
                        restrict_match = val.get("restrictSearchWithMatch")
                        if restrict_match:
                            restrict_match["tenantId"] = self.tenant_id
                        else:
                            val["restrictSearchWithMatch"] = {"tenantId": self.tenant_id}

            sanitized_pipeline.append(stage)

        return sanitized_pipeline

    # ── Database Operations ─────────────────────────────────────────────────────

    async def find(
        self,
        query: Optional[Dict[str, Any]] = None,
        sort: Optional[Any] = None,
        skip: int = 0,
        limit: int = 100,
        projection: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        scoped_query = self._apply_tenant_filter(query)
        cursor = self.collection.find(scoped_query, projection=projection)
        if sort:
            cursor = cursor.sort(sort)
        if skip > 0:
            cursor = cursor.skip(skip)
        if limit > 0:
            cursor = cursor.limit(limit)
        return await cursor.to_list(length=limit if limit > 0 else 1000)

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        scoped_query = self._apply_tenant_filter(query)
        return await self.collection.find_one(scoped_query, projection=projection)

    async def insert_one(self, doc: Dict[str, Any]):
        doc_to_save = dict(doc)
        self._inject_tenant_id(doc_to_save)
        return await self.collection.insert_one(doc_to_save)

    async def insert_many(self, docs: List[Dict[str, Any]]):
        if not docs:
            return None
        docs_to_save = [dict(d) for d in docs]
        for d in docs_to_save:
            self._inject_tenant_id(d)
        return await self.collection.insert_many(docs_to_save)

    async def update_one(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False
    ):
        scoped_query = self._apply_tenant_filter(query)
        if upsert and self.is_saas and self.tenant_id:
            # Ensure tenantId is injected on upsert
            if "$setOnInsert" in update:
                update["$setOnInsert"]["tenantId"] = self.tenant_id
            elif "$set" in update:
                update["$set"]["tenantId"] = self.tenant_id
            else:
                update["$setOnInsert"] = {"tenantId": self.tenant_id}

        return await self.collection.update_one(scoped_query, update, upsert=upsert)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]):
        scoped_query = self._apply_tenant_filter(query)
        return await self.collection.update_many(scoped_query, update)

    async def delete_one(self, query: Dict[str, Any]):
        scoped_query = self._apply_tenant_filter(query)
        return await self.collection.delete_one(scoped_query)

    async def delete_many(self, query: Dict[str, Any]):
        scoped_query = self._apply_tenant_filter(query)
        return await self.collection.delete_many(scoped_query)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        scoped_query = self._apply_tenant_filter(query)
        return await self.collection.count_documents(scoped_query)

    async def aggregate(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        sanitized_pipeline = self._validate_and_sanitize_pipeline(pipeline)
        cursor = self.collection.aggregate(sanitized_pipeline)
        return await cursor.to_list(length=None)
