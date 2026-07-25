import { deflateSync } from 'node:zlib';
import { Order } from '../entities/order.entity';

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildContentStream(lines: string[]): string {
  const ops = [
    'BT',
    '/F1 11 Tf',
    '72 740 Td',
    '14 TL',
    `(${pdfEscape(lines[0])}) Tj`,
  ];
  for (const line of lines.slice(1)) ops.push('T*', `(${pdfEscape(line)}) Tj`);
  ops.push('ET');
  return ops.join('\n');
}

// PLAN_FILEFORMATS.md D4 — a fixed line budget per page (comfortably below what fits on a
// 792pt-tall MediaBox at this content stream's 14pt line spacing); each page gets its own content
// stream starting fresh at the same `72 740 Td` origin.
const PAGE_LINE_BUDGET = 40;

function paginate(lines: string[]): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += PAGE_LINE_BUDGET) {
    pages.push(lines.slice(i, i + PAGE_LINE_BUDGET));
  }
  return pages;
}

// GET /orders/:id/receipt (M32, plan_v2.md Part R Cluster B) — a real PDF, hand-assembled rather
// than pulling in a PDF library for one fixture endpoint. The content stream is genuinely
// /FlateDecode-compressed (node:zlib, same as virtually every real-world PDF), so the served body
// is authentically binary rather than an ASCII string wearing a .pdf extension — the whole point
// of this milestone is proving out what tflw does with a response body that isn't valid UTF-8.
export function buildOrderReceiptPdf(order: Order): Buffer {
  const lines: string[] = [
    'ORDER RECEIPT',
    `Order: ${order.id}`,
    `Status: ${order.status}`,
    `Placed: ${order.createdAt.toISOString()}`,
    '',
  ];
  let total = 0;
  for (const item of order.items) {
    const unit = Number(item.unitPrice);
    const lineTotal = unit * item.quantity;
    total += lineTotal;
    const name = item.product?.name ?? item.productId;
    lines.push(
      `${name}  x${item.quantity}  @ $${unit.toFixed(2)} = $${lineTotal.toFixed(2)}`,
    );
  }
  if (order.discountAmount) {
    total -= Number(order.discountAmount);
    lines.push('', `Discount: -$${Number(order.discountAmount).toFixed(2)}`);
  }
  lines.push('', `Total: $${total.toFixed(2)}`);

  // PLAN_FILEFORMATS.md D4 — multi-page: /Pages/Kids grows to one entry per page, each with its
  // own /Contents stream object, all sharing the one /Font object. Object numbering: 1 catalog,
  // 2 pages, [3..2+N] page objects, next one font, then N content-stream objects.
  const pages = paginate(lines);
  const pageCount = pages.length;
  const firstPageObjNum = 3;
  const fontObjNum = firstPageObjNum + pageCount;
  const firstContentObjNum = fontObjNum + 1;

  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>\n', 'ascii'),
    Buffer.from(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObjNum + i} 0 R`).join(' ')}] /Count ${pageCount} >>\n`,
      'ascii',
    ),
  ];
  for (let i = 0; i < pageCount; i++) {
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${firstContentObjNum + i} 0 R >>\n`,
        'ascii',
      ),
    );
  }
  objects.push(
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n',
      'ascii',
    ),
  );
  for (const pageLines of pages) {
    const compressed = deflateSync(
      Buffer.from(buildContentStream(pageLines), 'ascii'),
    );
    objects.push(
      Buffer.concat([
        Buffer.from(
          `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`,
          'ascii',
        ),
        compressed,
        Buffer.from('\nendstream\n', 'ascii'),
      ]),
    );
  }

  // %PDF-1.4 header followed by the conventional 4-high-bit-byte comment line that marks a PDF as
  // binary to naive text-mode transfer tools — real PDF writers emit this too.
  const parts: Buffer[] = [
    Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3,
      0xcf, 0xd3, 0x0a,
    ]),
  ];
  const offsets: number[] = [0];
  let cursor = parts[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    const objBuf = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'ascii'),
      objects[i],
      Buffer.from('endobj\n', 'ascii'),
    ]);
    parts.push(objBuf);
    cursor += objBuf.length;
  }

  const xrefOffset = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref, 'ascii'));

  return Buffer.concat(parts);
}
