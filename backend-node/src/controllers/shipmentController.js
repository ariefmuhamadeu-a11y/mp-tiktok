import { importShipmentRows } from '../services/shipmentImportService.js';

export function createShipmentImport(req, res, next) {
    try {
        const result = importShipmentRows({
            storeId: Number(req.body?.storeId),
            fileName: req.body?.fileName,
            rows: req.body?.rows
        });
        return res.status(201).json({ data: result });
    } catch (error) {
        return next(error);
    }
}
