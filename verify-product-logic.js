"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🚀 Starting Product Logic Verification...');
    const uniqueSuffix = Date.now();
    const sku1 = `TEST-SKU-1-${uniqueSuffix}`;
    const sku2 = `TEST-SKU-2-${uniqueSuffix}`;
    console.log('1. Creating separate product for testing...');
    const product = await prisma.products.create({
        data: {
            name: `Test Product ${uniqueSuffix}`,
            type_code: 'RETAIL',
            status_code: 'ACTIVE',
            product_variants: {
                create: [
                    {
                        sku: sku1,
                        option_name: 'Option 1',
                        price: 100,
                        stock_available: 10,
                        stock_defect: 0
                    }
                ]
            }
        },
        include: { product_variants: true }
    });
    console.log(`✅ Created Product ID: ${product.product_id} with Variant SKU: ${sku1}`);
    console.log('2. Testing UPDATE Logic (Transaction)...');
    const updateData = {
        name: `Updated Name ${uniqueSuffix}`,
        variants: [
            {
                sku: sku1,
                option_name: 'Option 1 Updated',
                price: 150,
                stock_available: 999
            },
            {
                sku: sku2,
                option_name: 'Option 2 New',
                price: 200,
                stock_available: 5
            }
        ]
    };
    try {
        await prisma.$transaction(async (tx) => {
            await tx.products.update({
                where: { product_id: product.product_id },
                data: { name: updateData.name }
            });
            for (const v of updateData.variants) {
                const existing = await tx.product_variants.findUnique({ where: { sku: v.sku } });
                if (existing) {
                    console.log(`   - Updating existing variant ${v.sku}...`);
                    await tx.product_variants.update({
                        where: { variant_id: existing.variant_id },
                        data: {
                            option_name: v.option_name,
                            price: v.price
                        }
                    });
                }
                else {
                    console.log(`   - Creating new variant ${v.sku}...`);
                    await tx.product_variants.create({
                        data: {
                            product_id: product.product_id,
                            sku: v.sku,
                            option_name: v.option_name,
                            price: v.price,
                            stock_available: v.stock_available
                        }
                    });
                }
            }
        });
        console.log('✅ Update Transaction Successful');
    }
    catch (e) {
        console.error('❌ Update Failed:', e);
        process.exit(1);
    }
    const updatedProduct = await prisma.products.findUnique({
        where: { product_id: product.product_id },
        include: { product_variants: true }
    });
    if (updatedProduct) {
        console.log('--- Verification ---');
        console.log('Name check:', updatedProduct.name === updateData.name ? 'PASS' : 'FAIL');
        const v1 = updatedProduct.product_variants.find(v => v.sku === sku1);
        const v2 = updatedProduct.product_variants.find(v => v.sku === sku2);
        if (v1) {
            console.log('Variant 1 Price Update Check:', Number(v1.price) === 150 ? 'PASS' : `FAIL (Got ${v1.price})`);
            console.log('Variant 1 Stock Preservation Check:', v1.stock_available === 10 ? 'PASS' : `FAIL (Got ${v1.stock_available}, Expected 10 - Ignored 999)`);
        }
        else {
            console.log('❌ Variant 1 Lost!');
        }
        if (v2) {
            console.log('Variant 2 Creation Check:', 'PASS');
            console.log('Variant 2 Initial Stock Check:', v2.stock_available === 5 ? 'PASS' : 'FAIL');
        }
        else {
            console.log('❌ Variant 2 Failed to Create!');
        }
    }
    console.log('3. Testing REMOVE Logic (Soft Delete)...');
    await prisma.products.update({
        where: { product_id: product.product_id },
        data: {
            status_code: 'INACTIVE',
            deleted_at: new Date()
        }
    });
    const deletedProduct = await prisma.products.findUnique({ where: { product_id: product.product_id } });
    if (deletedProduct?.status_code === 'INACTIVE' && deletedProduct.deleted_at) {
        console.log('✅ Soft Delete Verified');
    }
    else {
        console.log('❌ Soft Delete Failed');
    }
    console.log('🧹 Cleaning up test data...');
    await prisma.product_variants.deleteMany({ where: { product_id: product.product_id } });
    await prisma.products.delete({ where: { product_id: product.product_id } });
    console.log('✅ Cleanup Complete');
}
main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
//# sourceMappingURL=verify-product-logic.js.map