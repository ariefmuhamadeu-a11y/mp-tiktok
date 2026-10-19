<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the promotion master and order-level discount tables.
     *
     * A promotion can be linked to an order discount when the source file
     * identifies the promotion. For historical imports that only expose an
     * amount and a discount owner, promotion_id remains nullable and the raw
     * source values are preserved instead of guessing a voucher or bundle.
     */
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->string('type', 32);
            $table->string('status', 32)->default('draft');
            $table->string('channel', 64)->nullable();
            $table->string('discount_type', 32)->nullable();
            $table->bigInteger('discount_value')->default(0);
            $table->bigInteger('min_order_amount')->default(0);
            $table->bigInteger('max_discount_amount')->default(0);
            $table->unsignedInteger('quota')->nullable();
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->string('source', 32)->default('manual');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status', 'starts_at', 'ends_at']);
            $table->index(['store_id', 'type', 'status']);
            $table->index(['store_id', 'code']);
        });

        Schema::create('promotion_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->string('target_type', 32);
            $table->string('target_key', 160);
            $table->unsignedInteger('quantity')->default(1);
            $table->bigInteger('normal_price')->default(0);
            $table->bigInteger('promo_price')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['promotion_id', 'target_type', 'target_key'], 'promotion_targets_unique');
            $table->index(['target_type', 'target_key']);
        });

        Schema::create('order_discounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('promotion_name_raw')->nullable();
            $table->string('promotion_code_raw')->nullable();
            $table->string('discount_type', 32);
            $table->string('funded_by', 32)->default('unknown');
            $table->bigInteger('amount')->default(0);
            $table->string('currency', 3)->default('IDR');
            $table->string('source', 32);
            $table->string('source_field')->nullable();
            $table->unsignedInteger('source_row')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'created_at']);
            $table->index(['store_id', 'discount_type', 'funded_by']);
            $table->index(['order_id', 'order_item_id']);
            $table->index(['promotion_id', 'order_id']);
        });

        Schema::create('promotion_import_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained()->nullOnDelete();
            $table->string('source_name', 64);
            $table->string('source_field');
            $table->string('mapped_type', 32);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['store_id', 'source_name', 'is_active']);
            $table->index(['source_field', 'mapped_type']);
        });

        Schema::create('promotion_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('store_id')->nullable()->constrained()->nullOnDelete();
            $table->string('entity_type', 64);
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->string('action', 32);
            $table->json('before_json')->nullable();
            $table->json('after_json')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'created_at']);
            $table->index(['entity_type', 'entity_id', 'created_at']);
        });
    }

    /**
     * Reverse the migration in dependency order.
     */
    public function down(): void
    {
        Schema::dropIfExists('promotion_audit_logs');
        Schema::dropIfExists('promotion_import_mappings');
        Schema::dropIfExists('order_discounts');
        Schema::dropIfExists('promotion_targets');
        Schema::dropIfExists('promotions');
    }
};
