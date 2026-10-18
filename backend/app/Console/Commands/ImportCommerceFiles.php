<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\CommerceFileImporter;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use InvalidArgumentException;
use RuntimeException;

#[Signature('commerce:import {storeId : ID toko} {--shipment= : Path CSV pengiriman} {--income= : Path XLSX pencairan}')]
#[Description('Impor CSV pengiriman dan XLSX dana masuk saldo ke toko yang dipilih')]
class ImportCommerceFiles extends Command
{
    public function handle(CommerceFileImporter $importer): int
    {
        $storeId = filter_var($this->argument('storeId'), FILTER_VALIDATE_INT);
        $store = $storeId === false ? null : Store::find($storeId);

        if ($store === null) {
            $this->error('ID toko tidak ditemukan.');

            return self::FAILURE;
        }

        $shipment = $this->option('shipment');
        $income = $this->option('income');

        if (! is_string($shipment) && ! is_string($income)) {
            $this->error('Isi --shipment dan/atau --income.');

            return self::FAILURE;
        }

        try {
            foreach (['shipment' => $shipment, 'income' => $income] as $kind => $path) {
                if (! is_string($path) || $path === '') {
                    continue;
                }

                $result = $kind === 'shipment'
                    ? $importer->importShipmentCsv($store->id, $path)
                    : $importer->importIncomeXlsx($store->id, $path);

                $this->line($kind.': '.json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            }
        } catch (InvalidArgumentException|RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
