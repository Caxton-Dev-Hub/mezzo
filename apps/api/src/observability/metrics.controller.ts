import type { Response } from 'express';
import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metricsService.contentType);
    res.send(await this.metricsService.render());
  }
}
