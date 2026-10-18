<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('import_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->string('kind', 32);
            $table->string('filename');
            $table->char('file_sha256', 64);
            $table->string('status', 32)->default('processing');
            $table->json('report_summary')->nullable();
            $table->text('warning')->nullable();
            $table->unsignedInteger('row_count')->default(0);
            $table->unsignedInteger('imported_count')->default(0);
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->unsignedInteger('unmatched_count')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->timestamp('imported_at')->nullable();
            $table->timestamps();

            $table->unique(['store_id', 'kind', 'file_sha256']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->string('external_order_id', 80);
            $table->string('source_order_status')->nullable();
            $table->string('source_order_substatus')->nullable();
            $table->string('cancellation_return_type')->nullable();
            $table->string('order_type')->nullable();
            $table->bigInteger('order_refund_amount')->nullable();
            $table->bigInteger('payment_platform_discount')->nullable();
            $table->bigInteger('buyer_service_fee')->nullable();
            $table->bigInteger('handling_fee')->nullable();
            $table->bigInteger('order_amount')->nullable();
            $table->dateTime('source_created_at')->nullable();
            $table->dateTime('source_paid_at')->nullable();
            $table->dateTime('source_cancelled_at')->nullable();
            $table->string('cancel_by')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->text('buyer_message')->nullable();
            $table->string('buyer_username')->nullable();
            $table->string('payment_method')->nullable();
            $table->string('purchase_channel')->nullable();
            $table->text('seller_note')->nullable();
            $table->string('checked_status')->nullable();
            $table->string('checked_marked_by')->nullable();
            $table->string('tokopedia_invoice_number')->nullable();
            $table->string('order_channel')->nullable();
            $table->string('creator_handle')->nullable();
            $table->timestamps();

            $table->unique(['store_id', 'external_order_id']);
        });

        Schema::create('order_packages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('package_key', 120);
            $table->string('external_package_id', 120)->nullable();
            $table->string('tracking_id', 120)->nullable();
            $table->string('delivery_option')->nullable();
            $table->string('shipping_provider_name')->nullable();
            $table->string('fulfillment_type')->nullable();
            $table->string('warehouse_name')->nullable();
            $table->dateTime('rts_at')->nullable();
            $table->dateTime('shipped_at')->nullable();
            $table->dateTime('delivered_at')->nullable();
            $table->bigInteger('shipping_fee_after_discount')->nullable();
            $table->bigInteger('original_shipping_fee')->nullable();
            $table->bigInteger('shipping_fee_seller_discount')->nullable();
            $table->bigInteger('shipping_fee_platform_discount')->nullable();
            $table->bigInteger('distance_shipping_fee')->nullable();
            $table->bigInteger('distance_fee')->nullable();
            $table->bigInteger('shipping_insurance')->nullable();
            $table->string('recipient')->nullable();
            $table->string('phone')->nullable();
            $table->string('zipcode')->nullable();
            $table->string('country')->nullable();
            $table->string('province')->nullable();
            $table->string('regency_city')->nullable();
            $table->string('districts')->nullable();
            $table->string('villages')->nullable();
            $table->text('detail_address')->nullable();
            $table->text('additional_address_information')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'package_key']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_package_id')->constrained('order_packages')->cascadeOnDelete();
            $table->char('line_key', 64);
            $table->string('sku_id', 120)->nullable();
            $table->string('seller_sku', 120)->nullable();
            $table->text('product_name')->nullable();
            $table->string('variation')->nullable();
            $table->unsignedInteger('quantity')->nullable();
            $table->unsignedInteger('returned_quantity')->nullable();
            $table->bigInteger('unit_original_price')->nullable();
            $table->bigInteger('subtotal_before_discount')->nullable();
            $table->bigInteger('platform_discount')->nullable();
            $table->bigInteger('seller_discount')->nullable();
            $table->bigInteger('subtotal_after_discount')->nullable();
            $table->bigInteger('item_insurance')->nullable();
            $table->decimal('weight_kg', 10, 3)->nullable();
            $table->string('product_category')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'line_key']);
        });

        Schema::create('financial_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->char('event_key', 64);
            $table->char('content_hash', 64);
            $table->string('external_reference_id', 120);
            $table->string('transaction_type');
            $table->date('ordered_on')->nullable();
            $table->date('credited_on')->nullable();
            $table->string('currency', 3)->default('IDR');
            $table->bigInteger('settlement_amount');
            $table->bigInteger('total_revenue')->nullable();
            $table->bigInteger('total_fees')->nullable();
            $table->bigInteger('refund_after_discount')->nullable();
            $table->bigInteger('platform_commission')->nullable();
            $table->bigInteger('logistics_service_fee')->nullable();
            $table->bigInteger('shipping_fee')->nullable();
            $table->bigInteger('seller_discount')->nullable();
            $table->json('breakdown');
            $table->timestamps();

            $table->unique(['store_id', 'event_key']);
            $table->index(['store_id', 'external_reference_id']);
        });

        Schema::create('financial_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('financial_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->char('event_key', 64);
            $table->char('content_hash', 64);
            $table->string('external_reference_id', 120);
            $table->string('transfer_type');
            $table->date('requested_on')->nullable();
            $table->date('completed_on')->nullable();
            $table->bigInteger('amount');
            $table->string('status')->nullable();
            $table->string('bank_account')->nullable();
            $table->timestamps();

            $table->unique(['store_id', 'event_key']);
            $table->index(['store_id', 'external_reference_id']);
        });

        Schema::create('import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_batch_id')->constrained('import_batches')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('financial_transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('financial_transfer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('sheet_name', 120);
            $table->unsignedInteger('row_number');
            $table->char('row_hash', 64);
            $table->string('result', 32);
            $table->text('message')->nullable();
            $table->json('raw_data');
            $table->timestamps();

            $table->unique(['import_batch_id', 'sheet_name', 'row_number'], 'import_rows_source_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('import_rows');
        Schema::dropIfExists('financial_transfers');
        Schema::dropIfExists('financial_transactions');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('order_packages');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('import_batches');
    }
};
