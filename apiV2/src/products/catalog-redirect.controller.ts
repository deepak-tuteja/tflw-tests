import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';

// Deprecated alias (M30, plan_v2.md Cluster A — "HTTP protocol corners"): `catalog` was this
// resource's name before it was renamed to `products`; old clients following a bookmarked/cached
// `catalog/:id` link get redirected straight through rather than a hard break. No existence check
// against `id` — the redirect target (`GET /products/:id`) already 404s on its own for an unknown
// id, so this stays a pure alias with no duplicated business logic. Excluded from the OpenAPI doc
// since it's not a real, forward-facing surface — just a compatibility shim.
@ApiExcludeController()
@Controller('catalog')
export class CatalogRedirectController {
  @Get(':id')
  redirectToProduct(@Param('id') id: string, @Res() res: Response) {
    res.redirect(302, `/v1/products/${id}`);
  }
}
