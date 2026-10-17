import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';

@Module({
  controllers: [CalendarController],
  providers: [CalendarRepository, CalendarService],
})
export class CalendarModule {}
