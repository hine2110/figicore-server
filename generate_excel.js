const ExcelJS = require('exceljs');
const fs = require('fs');

async function createReport() {
    const workbook = new ExcelJS.Workbook();
    
    const weeksData = [
        {
            name: 'Week 1', date: '<05/01/2026-11/01/2026>',
            status: [
                [1, 'Project repository initialization', 'HuyNTG', 'Completed', 'Setup Gitflow, GitHub actions for CI/CD pipeline.'],
                [2, 'DB architecture design (ERD)', 'HuyNTG', 'Completed', 'Diagraming core modules: Auth, HR, Products.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Schema complexity', 'HuyNTG', 'In Progress', 'Need to refine relationships for RBAC.']
            ],
            next: [
                [1, 'Schema implementation', 'DuongNB', '18/01/2026', 'Using Prisma & PostgreSQL.'],
                [2, 'Core Authentication Module', 'DatNT', '18/01/2026', 'Implement JWT, OTP, and Role-Based Access Control.']
            ]
        },
        {
            name: 'Week 2', date: '<12/01/2026-18/01/2026>',
            status: [
                [1, 'Schema implementation', 'DuongNB', 'Completed', 'Database migrated to PostgreSQL successfully.'],
                [2, 'Core Auth & RBAC', 'DatNT', 'Completed', 'Working across Admin, Manager, Warehouse, Staff, Customer.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Face Recognition Accuracy', 'ThuongNVH', 'In Progress', 'Adjusting confidence threshold to prevent false positives.']
            ],
            next: [
                [1, 'AI Biometric Activation', 'ThuongNVH', '25/01/2026', 'Staff account activation via Face ID.'],
                [2, 'HR Management Foundation', 'ThuongNVH', '25/01/2026', 'Staff profile management & workflows.']
            ]
        },
        {
            name: 'Week 3', date: '<19/01/2026-25/01/2026>',
            status: [
                [1, 'AI Biometric Activation', 'ThuongNVH', 'Completed', 'Implemented to prevent fraud during staff login.'],
                [2, 'HR Management Foundation', 'ThuongNVH', 'Completed', 'Authorization workflows completed.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'RBAC Middleware', 'DatNT', 'Completed', 'Fixed role guards for protected routes.']
            ],
            next: [
                [1, 'Product Management CRUD', 'DuongNB', '01/02/2026', 'CRUD for categories, brands, variants.'],
                [2, 'Warehouse Operations', 'ThuongNVH', '01/02/2026', 'Stock-in and Stock-out tracking.']
            ]
        },
        {
            name: 'Week 4', date: '<26/01/2026-01/02/2026>',
            status: [
                [1, 'Product Management system', 'DuongNB', 'Completed', 'Setup dynamic variants, categories, brands.'],
                [2, 'Warehouse Operations', 'ThuongNVH', 'Completed', 'System workflows for Inventory Input/Output.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Preorder FIFO Logic', 'HuyNTG', 'In Progress', 'Designing allocation algorithm for preorders.']
            ],
            next: [
                [1, 'Preorder Logic Core', 'HuyNTG', '08/02/2026', 'Implementing FIFO algorithm.'],
                [2, 'Deposit & Full Bet Checking', 'DatNT', '08/02/2026', 'Verify deposit transactions for preorders.']
            ]
        },
        {
            name: 'Week 5', date: '<02/02/2026-08/02/2026>',
            status: [
                [1, 'Preorder Logic Core', 'HuyNTG', 'Completed', 'FIFO allocation works correctly.'],
                [2, 'Checking deposits & full bets', 'DatNT', 'Completed', 'Handled deposit/full payment state split.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [],
            next: [
                [1, 'Rest & Prepare for Sprint 3', 'All', '22/02/2026', 'Holiday break (09/02 - 22/02).']
            ]
        },
        {
            name: 'Week 6', date: '<23/02/2026-01/03/2026>',
            status: [
                [1, 'Smart POS: UI & Barcode', 'DuongNB', 'Completed', 'In-store cash register & barcode support.'],
                [2, 'Smart POS: Offline Checkout', 'DuongNB', 'Completed', 'Cash handling and session workflows for staff.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'E-commerce Cart Sync', 'DatNT', 'In Progress', 'Handling guest vs logged-in cart merge.']
            ],
            next: [
                [1, 'Online E-commerce Exp.', 'DatNT', '08/03/2026', 'Cart functionality, Customer Wallet (Balance, Top-up).'],
                [2, 'Shift Registration', 'ThuongNVH', '08/03/2026', 'Minimum hour policies & Work scheduling.']
            ]
        },
        {
            name: 'Week 7', date: '<02/03/2026-08/03/2026>',
            status: [
                [1, 'Online E-commerce Experience', 'DatNT', 'Completed', 'Wallet System, Pre-order Workflow with deposit logic.'],
                [2, 'Staff Work Scheduling', 'ThuongNVH', 'Completed', 'Shift Registration & Manager approval workflows.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Concurrent Inventory Access', 'HuyNTG', 'In Progress', 'POS and Online channel conflicting on same stock.']
            ],
            next: [
                [1, 'Omnichannel Synchronization', 'HuyNTG', '15/03/2026', 'Sync inventory across online and physical POS.']
            ]
        },
        {
            name: 'Week 8', date: '<09/03/2026-15/03/2026>',
            status: [
                [1, 'Omnichannel Synchronization', 'HuyNTG', 'Completed', 'Database transactions lock implemented to prevent overselling.'],
                [2, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Setup GHN API', 'HuyNTG', 'Completed', 'API keys acquired for next sprint logistics.']
            ],
            next: [
                [1, 'Payment Gateway (VNPay, VietQR)', 'DuongNB', '22/03/2026', 'Auto confirmation for banking.'],
                [2, 'Logistics & Webhooks', 'HuyNTG', '22/03/2026', 'GHN real-time order tracking.']
            ]
        },
        {
            name: 'Week 9', date: '<16/03/2026-22/03/2026>',
            status: [
                [1, 'Payment Gateway Integration', 'DuongNB', 'Completed', 'VNPay & VietQR automated callbacks.'],
                [2, 'Logistics & Webhooks', 'HuyNTG', 'Completed', 'Integrated 3rd-party GHN API, automated status transition.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Report 1 & 2 drafts', 'HuyNTG', 'In Progress', 'Formatting documentation according to guidelines.']
            ],
            next: [
                [1, 'Warehouse Packing Fulfillment', 'ThuongNVH', '29/03/2026', 'Workflows for staff to pack & handover to shippers.'],
                [2, 'Notification Service', 'ThuongNVH', '29/03/2026', 'Email, SMS, In-app notifications.']
            ]
        },
        {
            name: 'Week 10', date: '<23/03/2026-29/03/2026>',
            status: [
                [1, 'Warehouse Packing Fulfillment', 'ThuongNVH', 'Completed', 'Packing verification & handover workflows done.'],
                [2, 'Notification Service', 'ThuongNVH', 'Completed', 'Trigger notifications on order status change.'],
                [3, 'Complete Report 1, Report 2', 'HuyNTG', 'Completed', 'Documentation submitted for review.'],
                [4, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'AI Prompt Engineering', 'DatNT', 'In Progress', 'Tuning LLM to answer product inquiries correctly.']
            ],
            next: [
                [1, 'AI Chatbot', 'DatNT', '05/04/2026', 'Automated support for products & tracking.'],
                [2, 'Complete Report 3', 'DuongNB', '05/04/2026', 'Documenting payment & logistics integrations.']
            ]
        },
        {
            name: 'Week 11', date: '<30/03/2026-05/04/2026>',
            status: [
                [1, 'AI Chatbot', 'DatNT', 'Completed', 'Dynamic order status tracking & product inquiries.'],
                [2, 'Complete Report 3', 'DuongNB', 'Completed', 'Ready for mentor review.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'LiveKit WebRTC Configs', 'HuyNTG', 'In Progress', 'Preparing server for next sprint Livestream module.']
            ],
            next: [
                [1, 'Real-time Livestream Module', 'HuyNTG', '12/04/2026', 'Dual-mode (Auctions & Direct Sales) via LiveKit.'],
                [2, 'Auction Management System', 'HuyNTG', '12/04/2026', 'Real-time bidding (WebSocket), deposits, winner flows.']
            ]
        },
        {
            name: 'Week 12', date: '<06/04/2026-12/04/2026>',
            status: [
                [1, 'Real-time Livestream Module', 'HuyNTG', 'Completed', 'Video streaming integrated using LiveKit.'],
                [2, 'Auction Management System', 'HuyNTG', 'Completed', 'WebSocket bidding, winner payment workflows.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'AI Analytic Data Format', 'DatNT', 'In Progress', 'Formatting inventory data for deep scan AI model.']
            ],
            next: [
                [1, 'AI-Driven Inventory Analytics', 'DatNT', '19/04/2026', 'Restock and Clearance recommendations.'],
                [2, 'Advanced Dashboards', 'DuongNB', '19/04/2026', 'Analytics for Sales KPIs, Warehouse, Workforce.'],
                [3, 'Manager Operations', 'ThuongNVH', '19/04/2026', 'Return Approvals workflow & dispute resolution.']
            ]
        },
        {
            name: 'Week 13', date: '<13/04/2026-19/04/2026>',
            status: [
                [1, 'AI-Driven Inventory Analytics', 'DatNT', 'Completed', 'Automated Restock & Clearance generation.'],
                [2, 'Advanced Dashboards', 'DuongNB', 'Completed', 'Comprehensive KPIs implemented.'],
                [3, 'Manager Operations', 'ThuongNVH', 'Completed', 'Return requests and disputes handling.'],
                [4, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'UAT Test Cases', 'ThuongNVH', 'In Progress', 'Drafting test cases for End-to-End flows.']
            ],
            next: [
                [1, 'User Acceptance Testing (UAT)', 'DatNT, ThuongNVH', '26/04/2026', 'Across all portals (Admin, Manager, Staff, Customer).'],
                [2, 'Start Report 4, 5', 'HuyNTG', '26/04/2026', 'Documenting Livestream, Auctions & Analytics.']
            ]
        },
        {
            name: 'Week 14', date: '<20/04/2026-26/04/2026>',
            status: [
                [1, 'UAT Execution', 'DatNT, ThuongNVH', 'Completed', 'Collected feedback from stakeholders.'],
                [2, 'Bug Fixing', 'DuongNB', 'Completed', 'Fixed UI/UX bugs based on UAT feedback.'],
                [3, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Livestream Load Issues', 'HuyNTG', 'In Progress', 'Socket.io disconnects during high load.']
            ],
            next: [
                [1, 'Performance Optimization', 'HuyNTG', '05/05/2026', 'Load testing Socket.io, DB Query optimization.'],
                [2, 'Report 4, Report 5', 'HuyNTG', '05/05/2026', 'Submit docs.'],
                [3, 'Report 6, Report 7', 'DuongNB, DatNT', '05/05/2026', 'Submit final testing & deployment docs.']
            ]
        },
        {
            name: 'Week 15', date: '<27/04/2026-05/05/2026>',
            status: [
                [1, 'Performance Optimization', 'HuyNTG', 'Completed', 'Redis caching applied, queries optimized.'],
                [2, 'Final Software Version', 'All', 'Completed', 'Production-ready version has been completed.'],
                [3, 'Report 4, 5, 6, 7', 'All', 'Completed', 'All reports approved by mentor.'],
                [4, 'Daily Scrum', 'All', 'Completed', 'Meeting 30 mins/day.']
            ],
            issues: [
                [1, 'Prepare Capstone Defense', 'All', 'Completed', 'Slides and Demo ready.']
            ],
            next: [
                [1, 'Capstone Defense', 'All', '-', 'Project Closed successfully.']
            ]
        }
    ];

    const blueFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0F2F1' } // Light Cyan/Teal
    };
    
    const borders = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };

    weeksData.forEach(week => {
        const sheet = workbook.addWorksheet(week.name);
        
        // Setup Columns
        sheet.columns = [
            { width: 5 },  // A
            { width: 40 }, // B
            { width: 18 }, // C
            { width: 15 }, // D
            { width: 55 }  // E
        ];

        // Headers
        const r1 = sheet.addRow(['PROJECT REPORT']);
        r1.font = { bold: true, size: 12 };
        
        const r2 = sheet.addRow(['Group', 'Group 32_CSB']);
        const r3 = sheet.addRow(['Week', week.date]);
        sheet.addRow([]);

        function createTable(title, headers, dataRows) {
            const titleRow = sheet.addRow([title]);
            titleRow.font = { bold: true };
            
            const headerRow = sheet.addRow(headers);
            headerRow.font = { bold: true, italic: true };
            headerRow.eachCell((cell) => {
                cell.fill = blueFill;
                cell.border = borders;
            });

            dataRows.forEach(rowData => {
                const row = sheet.addRow(rowData);
                row.eachCell((cell) => {
                    cell.border = borders;
                });
            });
            sheet.addRow([]); // empty row after table
        }

        createTable('I. Status Report', ['#', 'Project Task', 'In-charge', 'Status', 'Notes (Work Item in Details)'], week.status);
        createTable('II. Project Issues', ['#', 'Project Issue', 'Owner', 'Status', 'Notes (Solution, Suggestion, etc.)'], week.issues);
        createTable('III. Next Week Plan', ['#', 'Project Work Item', 'In-charge', 'Deadline', 'Notes (Task Details, etc.)'], week.next);
        createTable('IV. Other Project Masters/Suggestions', ['#', 'Project Matter/Suggestions', 'Raised By', 'Date', 'Notes'], []);
    });

    const outputPath = 'd:/Figicore/Project_Report_W1_to_W15.xlsx';
    await workbook.xlsx.writeFile(outputPath);
    console.log('Successfully created Excel file at: ' + outputPath);
}

createReport().catch(console.error);
