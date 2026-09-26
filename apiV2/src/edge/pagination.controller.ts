import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` data (decision 18): one fixed list of 25 items served two ways — by offset and limit, and by
// an opaque cursor — so a journey can walk both to the end and hold that neither drops nor repeats an
// item at a page boundary.
const ITEMS = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `item ${i + 1}`,
}));

@ApiExcludeController()
@Controller('edge/items')
export class PaginationController {
  @Get()
  page(
    @Query('offset') offset: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ) {
    const size = Math.min(Math.max(Number(limit ?? 10) || 10, 1), 25);
    if (cursor !== undefined) {
      const start =
        cursor === ''
          ? 0
          : Number(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!Number.isInteger(start) || start < 0)
        throw new BadRequestException('not a cursor this server issued');
      const data = ITEMS.slice(start, start + size);
      const next =
        start + size < ITEMS.length
          ? Buffer.from(String(start + size)).toString('base64url')
          : null;
      return { data, nextCursor: next };
    }
    const from = Math.max(Number(offset ?? 0) || 0, 0);
    return {
      data: ITEMS.slice(from, from + size),
      offset: from,
      limit: size,
      total: ITEMS.length,
    };
  }
}
