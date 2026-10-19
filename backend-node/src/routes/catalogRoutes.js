import { Router } from 'express';
import {
    indexMappings,
    indexAuditLogs,
    indexProducts,
    indexUnmatchedOrderItems,
    indexVariants,
    patchMapping,
    patchProduct,
    patchVariant,
    showProduct,
    showVariant,
    applyMappingBackfill,
    previewMappingBackfill,
    storeMapping,
    storeProduct,
    storeVariant
} from '../controllers/catalogController.js';

const productRouter = Router();
productRouter.get('/', indexProducts);
productRouter.post('/', storeProduct);
productRouter.get('/:id/variants', indexVariants);
productRouter.post('/:productId/variants', storeVariant);
productRouter.get('/:id', showProduct);
productRouter.patch('/:id', patchProduct);

const variantRouter = Router();
variantRouter.get('/', indexVariants);
variantRouter.get('/:id', showVariant);
variantRouter.patch('/:id', patchVariant);

const mappingRouter = Router();
mappingRouter.get('/unmatched-order-items', indexUnmatchedOrderItems);
mappingRouter.get('/audit', indexAuditLogs);
mappingRouter.post('/backfill/preview', previewMappingBackfill);
mappingRouter.post('/backfill/apply', applyMappingBackfill);
mappingRouter.get('/', indexMappings);
mappingRouter.post('/', storeMapping);
mappingRouter.patch('/:id', patchMapping);

export { productRouter, variantRouter, mappingRouter };
