import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { brotliCompressSync } from 'node:zlib';

// `S-3d` transport (decision 18): a brotli body (`Content-Encoding: br`) and a chunked one. gzip is
// already every response here (`main.ts` compresses at threshold 0); brotli is sent by hand, with its
// own `Content-Encoding`, which the compression middleware leaves alone. The chunked body arrives in
// three writes a beat apart and must still parse as one JSON document.
@ApiExcludeController()
@Controller('edge')
export class EncodingController {
  @Get('brotli')
  brotli(@Res() res: Response): void {
    const body = Buffer.from(
      JSON.stringify({ encoding: 'br', greeting: 'hello from a brotli body' }),
    );
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', 'br');
    res.end(brotliCompressSync(body));
  }

  @Get('chunked')
  async chunked(@Res() res: Response): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-transform');
    const parts = ['{"chunks":[', '"one","two",', '"three"]}'];
    for (const part of parts) {
      res.write(part);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    res.end();
  }
}
