import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AllocateFundDto {
  @ApiProperty({ example: 'FSELX' })
  @IsString()
  symbol!: string;

  @ApiProperty({
    example: 0.6,
    description: 'Net expense ratio as a percent. Use 0 for individual stocks.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  expenseRatio!: number | null;

  @ApiProperty({
    example: 31.09,
    description: 'Long-term annualized return as a percent.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  longTermReturn!: number | null;

  @ApiPropertyOptional({
    example: 1.96,
    description: '5-year beta. Omitted/null is treated as 1.0 (market) — no penalty.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  beta?: number | null;
}

export class AllocateOptionsDto {
  @ApiPropertyOptional({ example: 1.0, default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxExpenseRatio?: number;

  @ApiPropertyOptional({ example: 12.0, default: 12.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minLongTermReturn?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Excess-risk (beta) penalty coefficient. 0 disables the term.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  betaPenaltyCoefficient?: number;
}

export class AllocateRequestDto {
  @ApiProperty({ type: [AllocateFundDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocateFundDto)
  funds!: AllocateFundDto[];

  @ApiProperty({ example: 7000, description: 'Total capital to allocate (USD).' })
  @IsNumber()
  @IsPositive()
  allocatedCapital!: number;

  @ApiPropertyOptional({ type: AllocateOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AllocateOptionsDto)
  options?: AllocateOptionsDto;
}
