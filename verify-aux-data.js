"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🚀 Verifying Auxiliary Data Modules Logic...');
    const unique = Date.now();
    console.log('\n--- 1. Testing BRANDS Logic (Case Insensitive) ---');
    const brandName = `Test Brand ${unique}`;
    console.log(`> Checking: "${brandName}"`);
    let brand = await prisma.brands.findFirst({
        where: { name: { equals: brandName, mode: 'insensitive' } }
    });
    if (!brand) {
        console.log('  - Not found. Creating...');
        brand = await prisma.brands.create({ data: { name: brandName } });
    }
    const id1 = brand.brand_id;
    console.log(`  ✅ Result 1: ID=${id1}, Name=${brand.name}`);
    const brandNameUpper = brandName.toUpperCase();
    console.log(`> Checking: "${brandNameUpper}" (Uppercased)`);
    let brand2 = await prisma.brands.findFirst({
        where: { name: { equals: brandNameUpper, mode: 'insensitive' } }
    });
    if (!brand2) {
        console.log('  - Not found. Creating...');
        brand2 = await prisma.brands.create({ data: { name: brandNameUpper } });
    }
    const id2 = brand2.brand_id;
    console.log(`  ✅ Result 2: ID=${id2}, Name=${brand2.name}`);
    if (id1 === id2)
        console.log('Assertion: IDs Match ✅');
    else
        console.error('Assertion: IDs Do NOT Match ❌');
    console.log('\n--- 2. Testing CATEGORIES Logic (Slug Gen) ---');
    const catName = `Test Category ${unique}`;
    const expectedSlug = catName.toLowerCase().replace(/ /g, '-');
    console.log(`> Input: "${catName}" -> Expected Slug: "${expectedSlug}"`);
    let cat = await prisma.categories.findFirst({
        where: {
            OR: [
                { name: { equals: catName, mode: 'insensitive' } },
                { slug: expectedSlug }
            ]
        }
    });
    if (!cat) {
        console.log('  - Not found. Creating...');
        cat = await prisma.categories.create({
            data: { name: catName, slug: expectedSlug }
        });
    }
    const catId1 = cat.category_id;
    console.log(`  ✅ Result 1: ID=${catId1}, Slug=${cat.slug}`);
    console.log(`> Checking again (Existing)`);
    let cat2 = await prisma.categories.findFirst({
        where: {
            OR: [
                { name: { equals: catName, mode: 'insensitive' } },
                { slug: expectedSlug }
            ]
        }
    });
    const catId2 = cat2?.category_id;
    if (catId1 === catId2)
        console.log('Assertion: IDs Match ✅');
    else
        console.error('Assertion: IDs Do NOT Match ❌');
    console.log('\n--- 3. Testing SERIES Logic ---');
    const seriesName = `Series ${unique}`;
    const s1 = await prisma.series.create({ data: { name: seriesName } });
    const s2 = await prisma.series.findFirst({ where: { name: { equals: seriesName.toUpperCase(), mode: 'insensitive' } } });
    if (s1.series_id === s2?.series_id)
        console.log(`Assertion: Series Find/Create Logic OK ✅`);
    else
        console.error('Assertion: Series Failed ❌');
    console.log('\n🧹 Cleaning Up...');
    await prisma.brands.delete({ where: { brand_id: id1 } });
    await prisma.categories.delete({ where: { category_id: catId1 } });
    await prisma.series.delete({ where: { series_id: s1.series_id } });
    console.log('✅ Cleanup Done.');
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=verify-aux-data.js.map