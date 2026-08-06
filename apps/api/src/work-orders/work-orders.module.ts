import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkOrder, WorkOrderSchema } from './schemas/work-order.schema';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: WorkOrder.name, schema: WorkOrderSchema }])],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService, MongooseModule],
})
export class WorkOrdersModule {}
