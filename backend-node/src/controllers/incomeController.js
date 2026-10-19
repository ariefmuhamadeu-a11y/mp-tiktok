import { importIncomeRows } from '../services/incomeImportService.js';

export function createIncomeImport(req, res, next) {
    try {
        const result = importIncomeRows({
            storeId: Number(req.body?.storeId),
            fileName: req.body?.fileName,
            details: req.body?.details,
            withdrawals: req.body?.withdrawals,
            report: req.body?.report
        });
        return res.status(201).json({ data: result });
    } catch (error) {
        return next(error);
    }
}
