import { Body, Controller, Post, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { resFormatMethod } from '../../utils/resFormat.util';
import { JwtPayloadType } from '../../types/auth.type';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 提交订单（创建订单）
   * 需要登录，从 JWT 中获取 userId
   */
  @Post('create')
  async createOrder(
    @Req() req: { user: JwtPayloadType },
    @Body() createOrderDto: CreateOrderDto,
  ) {
    const { id: userId } = req.user;
    const result = await this.orderService.createDto(userId, createOrderDto);
    return resFormatMethod(0, '订单创建成功', result);
  }
}
