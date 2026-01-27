import { Controller, Post, Body, Get, Query, ParseArrayPipe, Patch, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { WorkSchedulesService } from './work-schedules.service';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { CloneWorkScheduleDto } from './dto/clone-work-schedule.dto';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';

@Controller('schedules')
export class WorkSchedulesController {
    constructor(private readonly workSchedulesService: WorkSchedulesService) { }

    @Post()
    create(@Body() createWorkScheduleDto: CreateWorkScheduleDto) {
        return this.workSchedulesService.create(createWorkScheduleDto);
    }

    @Post('bulk')
    createBulk(@Body(new ParseArrayPipe({ items: CreateWorkScheduleDto })) dtos: CreateWorkScheduleDto[]) {
        return this.workSchedulesService.createBulk(dtos);
    }

    @Post('clone')
    clone(@Body() cloneWorkScheduleDto: CloneWorkScheduleDto) {
        return this.workSchedulesService.clone(cloneWorkScheduleDto);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() updateWorkScheduleDto: UpdateWorkScheduleDto) {
        return this.workSchedulesService.update(id, updateWorkScheduleDto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.workSchedulesService.remove(id);
    }

    @Get()
    findAll(@Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesService.findAll(filter);
    }

    @Get('summary')
    getSummary(@Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesService.getSummary(filter);
    }
}
