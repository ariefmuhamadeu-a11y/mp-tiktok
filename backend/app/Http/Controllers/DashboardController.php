<?php

namespace App\Http\Controllers;

use App\Services\CommerceFileImporter;
use App\Services\WorkspacePageService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\View\View;
use App\Models\Store;
use App\Models\User;
use InvalidArgumentException;
use RuntimeException;

class DashboardController extends Controller
{
    public function __construct(private readonly WorkspacePageService $workspace) {}

    public function index(Request $request): View
    {
        return view('dashboard', $this->workspace->context($request->integer('store_id')));
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'platform' => ['required', 'string', 'max:40'],
        ]);
        $user = User::query()->firstOrCreate(
            ['email' => 'owner@mp-tiktok.test'],
            ['name' => 'Workspace Owner', 'password' => Hash::make(Str::random(64))],
        );
        $baseSlug = Str::slug($validated['name']) ?: 'toko';
        $slug = $baseSlug;
        $suffix = 2;
        while (Store::query()->where('user_id', $user->id)->where('slug', $slug)->exists()) {
            $slug = $baseSlug.'-'.$suffix++;
        }
        $store = Store::create([
            'user_id' => $user->id,
            'name' => $validated['name'],
            'slug' => $slug,
            'platform' => $validated['platform'],
            'is_active' => true,
        ]);

        return redirect()->route('stores.index', ['store_id' => $store->id])
            ->with('success', 'Toko berhasil ditambahkan.');
    }

    public function importShipment(Request $request, CommerceFileImporter $importer): RedirectResponse
    {
        $validated = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'shipment' => ['required', 'file', 'mimes:csv,txt', 'max:51200'],
        ]);
        $path = $this->temporaryUploadPath($request->file('shipment'), 'csv');

        try {
            return $this->runImport(
                $validated['store_id'],
                fn (int $storeId, string $path): array => $importer->importShipmentCsv($storeId, $path),
                $path,
                'Import shipment',
                'imports.shipment.index',
            );
        } finally {
            @unlink($path);
        }
    }

    public function importIncome(Request $request, CommerceFileImporter $importer): RedirectResponse
    {
        $validated = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'income' => ['required', 'file', 'mimes:xlsx', 'max:51200'],
        ]);
        $path = $this->temporaryUploadPath($request->file('income'), 'xlsx');

        try {
            return $this->runImport(
                $validated['store_id'],
                fn (int $storeId, string $path): array => $importer->importIncomeXlsx($storeId, $path),
                $path,
                'Import keuangan',
                'imports.income.index',
            );
        } finally {
            @unlink($path);
        }
    }

    /** @param callable(int, string): array<string, int|string> $callback */
    private function runImport(int $storeId, callable $callback, string|false $path, string $label, string $route): RedirectResponse
    {
        if ($path === false) {
            return redirect()->route($route, ['store_id' => $storeId])->with('error', $label.' gagal: file tidak dapat dibaca.');
        }

        try {
            $result = $callback($storeId, $path);
            $status = $result['status'] ?? 'imported';
            $message = $status === 'already_imported'
                ? $label.' dilewati karena file yang sama sudah pernah diimpor.'
                : $label.' berhasil. '.($result['imported_count'] ?? 0).' baris disimpan.';

            return redirect()->route($route, ['store_id' => $storeId])->with('success', $message);
        } catch (InvalidArgumentException|RuntimeException $exception) {
            return redirect()->route($route, ['store_id' => $storeId])->with('error', $label.' gagal: '.$exception->getMessage());
        }
    }

    private function temporaryUploadPath(UploadedFile $file, string $extension): string
    {
        $source = $file->getRealPath();
        $temporaryPath = tempnam(sys_get_temp_dir(), 'mp-tiktok-');
        if ($source === false || $temporaryPath === false) {
            throw new RuntimeException('File upload tidak dapat disiapkan.');
        }
        $path = $temporaryPath.'.'.$extension;
        @unlink($temporaryPath);
        if (! copy($source, $path)) {
            throw new RuntimeException('File upload tidak dapat disalin.');
        }

        return $path;
    }
}
