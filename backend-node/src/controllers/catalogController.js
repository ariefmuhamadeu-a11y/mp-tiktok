import {
    createMapping,
    createProduct,
    createVariant,
    applyBackfill,
    getProduct,
    getVariant,
    listAuditLogs,
    listMappings,
    listProducts,
    listUnmatchedOrderItems,
    listVariants,
    previewBackfill,
    updateMapping,
    updateProduct,
    updateVariant
} from '../services/catalogService.js';

export function indexProducts(req, res, next) {
    try { return res.json({ data: listProducts({ userId: req.query.userId }) }); } catch (error) { return next(error); }
}

export function showProduct(req, res, next) {
    try { return res.json({ data: getProduct({ productId: req.params.id, userId: req.query.userId }) }); } catch (error) { return next(error); }
}

export function storeProduct(req, res, next) {
    try { return res.status(201).json({ data: createProduct(req.body || {}) }); } catch (error) { return next(error); }
}

export function patchProduct(req, res, next) {
    try { return res.json({ data: updateProduct({ ...req.body, productId: req.params.id }) }); } catch (error) { return next(error); }
}

export function indexVariants(req, res, next) {
    try { return res.json({ data: listVariants({ userId: req.query.userId, productId: req.params.id ?? req.query.productId }) }); } catch (error) { return next(error); }
}

export function showVariant(req, res, next) {
    try { return res.json({ data: getVariant({ variantId: req.params.id, userId: req.query.userId }) }); } catch (error) { return next(error); }
}

export function storeVariant(req, res, next) {
    try { return res.status(201).json({ data: createVariant({ ...req.body, productId: req.params.productId }) }); } catch (error) { return next(error); }
}

export function patchVariant(req, res, next) {
    try { return res.json({ data: updateVariant({ ...req.body, variantId: req.params.id }) }); } catch (error) { return next(error); }
}

export function indexMappings(req, res, next) {
    try { return res.json({ data: listMappings({ storeId: req.query.storeId, platform: req.query.platform, status: req.query.status }) }); } catch (error) { return next(error); }
}

export function storeMapping(req, res, next) {
    try { return res.status(201).json({ data: createMapping(req.body || {}) }); } catch (error) { return next(error); }
}

export function patchMapping(req, res, next) {
    try { return res.json({ data: updateMapping({ ...req.body, mappingId: req.params.id }) }); } catch (error) { return next(error); }
}

export function indexUnmatchedOrderItems(req, res, next) {
    try {
        return res.json({ data: listUnmatchedOrderItems({
            storeId: req.query.storeId,
            platform: req.query.platform,
            status: req.query.status,
            limit: req.query.limit,
            offset: req.query.offset
        }) });
    } catch (error) { return next(error); }
}

export function previewMappingBackfill(req, res, next) {
    try { return res.json({ data: previewBackfill(req.body || {}) }); } catch (error) { return next(error); }
}

export function applyMappingBackfill(req, res, next) {
    try { return res.json({ data: applyBackfill(req.body || {}) }); } catch (error) { return next(error); }
}

export function indexAuditLogs(req, res, next) {
    try {
        return res.json({ data: listAuditLogs({
            storeId: req.query.storeId,
            entityType: req.query.entityType,
            limit: req.query.limit,
            offset: req.query.offset
        }) });
    } catch (error) { return next(error); }
}
