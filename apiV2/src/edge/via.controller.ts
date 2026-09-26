import { Controller, Get, Headers } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` infrastructure (decision 18): the `Via` header a request arrived with. A direct request has
// none, and so does one through `ops/proxy` from tflw — Node's proxy agent tunnels (`CONNECT`), and a
// tunnel is bytes the proxy cannot annotate. A proxied plain `GET` (curl `-x`) carries one.
@ApiExcludeController()
@Controller('edge/via')
export class ViaController {
  @Get()
  via(@Headers('via') via: string | undefined): { via: string | null } {
    return { via: via ?? null };
  }
}
