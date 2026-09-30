# Personal Finance PWA

PWA สำหรับติดตามรายรับ ภาระหนี้ และหลักฐานการชำระเงิน โดยจัดงบตามเดือนที่ผู้ใช้เลือก

## สถานะการเชื่อมต่อ

- โหมดทดลองเก็บรายการใน `localStorage` ของอุปกรณ์นั้น ข้อมูลจะไม่ซิงก์ระหว่าง iPhone, iPad และ Mac
- โหมด Google อ่านและเขียนแท็บ `Transactions` ผ่าน Vercel API และ Google Apps Script
- เมื่อยืนยันรายการ แอปจะเพิ่มแถวในชีต และอัปโหลดหลักฐานไปยังโฟลเดอร์ Drive ที่ตั้งค่าไว้
- การซ่อนรายการเปลี่ยนสถานะในชีตเป็น `ลบแล้ว` แถวเดิมยังอยู่เพื่อให้ตรวจสอบย้อนหลังได้
- เชื่อมต่อบัญชี Google ฝั่งเซิร์ฟเวอร์ด้วยสิทธิ์เจ้าของ Apps Script; ผู้ใช้แอปเข้าสู่ระบบด้วยรหัสผ่านแอป

## เริ่มต้นใช้งานแบบทดลอง

```bash
npm install
npm run dev
```

ถ้าเปิดด้วย Vite โดยไม่มี Vercel API routes แอปจะแสดงป้าย **โหมดทดลอง** และใช้ข้อมูลในเครื่อง

## เปิด Google Sheets และ Drive sync

1. เพิ่มโค้ดจาก [`apps-script/Code.gs`](apps-script/Code.gs) ในโปรเจกต์ Google Apps Script ที่มีสิทธิ์เข้าถึงชีตและโฟลเดอร์ Drive ปลายทาง
2. ใน Apps Script เปิด **Project Settings → Script Properties** แล้วกำหนด `SPREADSHEET_ID`, `DRIVE_FOLDER_ID` และ `API_SHARED_SECRET`
3. สร้าง Web app deployment ให้ทำงานในนามเจ้าของสคริปต์ URL ต้องลงท้ายด้วย `/exec`; ดูรายละเอียดใน [`apps-script/README.md`](apps-script/README.md)
4. ตั้ง Vercel Environment Variables ตามชื่อใน [`.env.example`](.env.example) โดยใช้ `API_SHARED_SECRET` ค่าเดียวกับ `GOOGLE_APPS_SCRIPT_SECRET`
5. Deploy Vercel ใหม่ เปิดแอป และเข้าสู่ระบบด้วย `APP_PASSWORD`

ตัวอย่างสร้าง secret บนเครื่อง:

```bash
openssl rand -base64 36
```

สร้างค่าแยกกันสำหรับ `SESSION_SECRET` และ `GOOGLE_APPS_SCRIPT_SECRET`; เก็บทั้งสองไว้ใน password manager และอย่า commit ค่าใช้งานจริงลง Git

## ข้อมูลและความปลอดภัย

- Google secret อยู่ฝั่ง Vercel/Apps Script เท่านั้น ไม่มีตัวแปร `VITE_*` ที่ส่งไป browser
- API ใช้ session cookie แบบ `HttpOnly`, `SameSite=Lax` และ `Secure` ใน production
- API responses ไม่ถูกเก็บใน Service Worker cache
- รับไฟล์ JPG, PNG, WebP, HEIC, HEIF และ PDF ขนาดไม่เกิน 3 MB; แอปส่งไฟล์ไป Drive หลังผู้ใช้ยืนยันรายการ
- การอ่านข้อความจากสลิปยังเป็นการกรอกและตรวจเอง ไม่มี OCR/AI จริง

## หน้าจอ

- Mac: sidebar เต็มและตารางข้อมูลหลายคอลัมน์
- iPad: sidebar แบบย่อและแถวรายการที่อ่านง่ายขึ้น
- iPhone: เมนูด้านล่าง ปุ่มสัมผัสขนาดใหญ่ safe area และแผงตรวจรายการแบบ bottom sheet

## Build

```bash
npm run build
```
