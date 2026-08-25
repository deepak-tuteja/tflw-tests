import { ApiProperty } from '@nestjs/swagger';

// Documented so the frozen payload appears in `/openapi.json` like every other route's. Unlike
// `contract-demo`'s DTO, this one is deliberately *accurate*: the drift there is the fixture, and a
// second drifting schema here would make a `matches schema` failure ambiguous between two plants.
export class SoftCheckAnswerDto {
  @ApiProperty({ example: 'known-answer' })
  label!: string;

  @ApiProperty({
    example: 4,
    description: 'how many of the plant’s `check` lines are true',
  })
  truthy!: number;

  @ApiProperty({
    example: 2,
    description: 'how many are false — the known answer',
  })
  falsy!: number;

  @ApiProperty({ example: 42 })
  price!: number;

  @ApiProperty({ example: 'EUR' })
  currency!: string;

  @ApiProperty({ example: true })
  inStock!: boolean;

  // `readonly`, because the constant behind it is `as const` and that is the point of it — a plant
  // whose payload can be mutated in flight is not a frozen known answer. Copying it into a mutable
  // array at the controller would satisfy the compiler and quietly give up the guarantee.
  @ApiProperty({ example: ['plant', 'soft-assertion'], type: [String] })
  tags!: readonly string[];
}
