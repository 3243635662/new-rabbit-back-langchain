import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  constructor(private configService: ConfigService) {
    const port = this.configService.get<number>('PORT');
    console.log('UserService initialized with PORT:', port);
  }
}
