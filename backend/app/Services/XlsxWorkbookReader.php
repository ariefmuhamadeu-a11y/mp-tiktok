<?php

namespace App\Services;

use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

class XlsxWorkbookReader
{
    private const SHEET_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

    /** @return array<int, array{row_number: int, cells: array<int, string>}> */
    public function readSheet(string $path, string $sheetName): array
    {
        $archive = new ZipArchive;

        if ($archive->open($path) !== true) {
            throw new RuntimeException('File XLSX tidak dapat dibuka.');
        }

        try {
            $sheetPath = $this->sheetPath($archive, $sheetName);
            $sharedStrings = $this->sharedStrings($archive);
            $sheet = $this->xml($archive, $sheetPath);
            $sheet->registerXPathNamespace('s', self::SHEET_NAMESPACE);
            $rows = [];

            foreach ($sheet->xpath('//s:sheetData/s:row') ?: [] as $row) {
                $cells = [];
                $row->registerXPathNamespace('s', self::SHEET_NAMESPACE);

                foreach ($row->xpath('./s:c') ?: [] as $cell) {
                    $reference = (string) $cell['r'];

                    if (preg_match('/^([A-Z]+)\d+$/', $reference, $matches) !== 1) {
                        continue;
                    }

                    $cells[$this->columnIndex($matches[1])] = $this->cellValue($cell, $sharedStrings);
                }

                if ($cells !== []) {
                    $rows[] = [
                        'row_number' => (int) $row['r'],
                        'cells' => $cells,
                    ];
                }
            }

            return $rows;
        } finally {
            $archive->close();
        }
    }

    private function sheetPath(ZipArchive $archive, string $sheetName): string
    {
        $workbook = $this->xml($archive, 'xl/workbook.xml');
        $workbook->registerXPathNamespace('s', self::SHEET_NAMESPACE);
        $relationships = $this->xml($archive, 'xl/_rels/workbook.xml.rels');
        $relationships->registerXPathNamespace('p', 'http://schemas.openxmlformats.org/package/2006/relationships');

        foreach ($workbook->xpath('//s:sheets/s:sheet') ?: [] as $sheet) {
            if ((string) $sheet['name'] !== $sheetName) {
                continue;
            }

            $relationshipId = (string) $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];

            foreach ($relationships->xpath('//p:Relationship') ?: [] as $relationship) {
                if ((string) $relationship['Id'] !== $relationshipId) {
                    continue;
                }

                $target = (string) $relationship['Target'];
                $path = str_starts_with($target, '/') ? ltrim($target, '/') : 'xl/'.ltrim($target, '/');

                if (str_contains($path, '..')) {
                    throw new RuntimeException('Lokasi sheet XLSX tidak valid.');
                }

                return $path;
            }
        }

        throw new RuntimeException("Sheet {$sheetName} tidak ditemukan.");
    }

    /** @return array<int, string> */
    private function sharedStrings(ZipArchive $archive): array
    {
        if ($archive->locateName('xl/sharedStrings.xml') === false) {
            return [];
        }

        $xml = $this->xml($archive, 'xl/sharedStrings.xml');
        $xml->registerXPathNamespace('s', self::SHEET_NAMESPACE);
        $values = [];

        foreach ($xml->xpath('//s:si') ?: [] as $string) {
            $string->registerXPathNamespace('s', self::SHEET_NAMESPACE);
            $values[] = implode('', array_map(
                static fn (SimpleXMLElement $text): string => (string) $text,
                $string->xpath('.//s:t') ?: [],
            ));
        }

        return $values;
    }

    /** @param array<int, string> $sharedStrings */
    private function cellValue(SimpleXMLElement $cell, array $sharedStrings): string
    {
        $type = (string) $cell['t'];

        if ($type === 'inlineStr') {
            $cell->registerXPathNamespace('s', self::SHEET_NAMESPACE);

            return implode('', array_map(
                static fn (SimpleXMLElement $text): string => (string) $text,
                $cell->xpath('.//s:t') ?: [],
            ));
        }

        $cell->registerXPathNamespace('s', self::SHEET_NAMESPACE);
        $values = $cell->xpath('./s:v') ?: [];
        $value = isset($values[0]) ? (string) $values[0] : '';

        if ($value === '') {
            return '';
        }

        return $type === 's' ? ($sharedStrings[(int) $value] ?? '') : $value;
    }

    private function columnIndex(string $letters): int
    {
        $index = 0;

        foreach (str_split($letters) as $letter) {
            $index = $index * 26 + ord($letter) - ord('A') + 1;
        }

        return $index - 1;
    }

    private function xml(ZipArchive $archive, string $entry): SimpleXMLElement
    {
        $contents = $archive->getFromName($entry);

        if ($contents === false) {
            throw new RuntimeException("Bagian XLSX {$entry} tidak ditemukan.");
        }

        $xml = simplexml_load_string($contents, SimpleXMLElement::class, LIBXML_NONET);

        if ($xml === false) {
            throw new RuntimeException("Bagian XLSX {$entry} tidak valid.");
        }

        return $xml;
    }
}
