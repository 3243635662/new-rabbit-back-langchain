import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class EmailService implements OnModuleDestroy, OnModuleInit {
  private transporter: nodemailer.Transporter; // 邮件发送器

  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<boolean>('EMAIL_SECURE'),
      auth: {
        user: this.configService.get<string>('EMAIL_ACCOUNT'),
        pass: this.configService.get<string>('EMAIL_key'),
      },
      // 可选：启用调试日志（开发时打开，生产关闭）
      logger: true,
      debug: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.transporter.verify((error) => {
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.logger.error(`SMTP 连接失败: ${error.message}}`);
      } else {
        this.logger.log('SMTP 连接成功');
      }
    });
  }

  onModuleDestroy() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.transporter.close();
  }

  // 发送邮箱注册验证码
  async sendRegisterCode(email: string, code: string): Promise<void> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: '"fanfan-time" <fanfan0521@yeah.net>',
      to: email,
      subject: '注册验证码',
      text: `您的注册验证码是: ${code}`,
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>注册验证码</title>
</head>
<body style="margin: 0; padding: 0; background: #ecfdf5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="480" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border-radius: 16px; box-shadow: 0 10px 30px rgba(5, 150, 105, 0.1); overflow: hidden;">
                    <!-- 头部 -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #34d399 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 10px;">🍃</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 2px;">安全验证</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">fanfan-time 注册</p>
                        </td>
                    </tr>
                    
                    <!-- 内容 -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: center;">
                            <p style="color: #4b5563; font-size: 16px; margin: 0 0 25px 0; line-height: 1.6;">
                                您好，欢迎加入我们！<br>
                                您的注册验证码如下：
                            </p>
                            
                            <!-- 验证码 -->
                            <div style="background: #ebfdf5; border-radius: 12px; padding: 30px; margin: 25px 0; border: 2px dashed #34d399;">
                                <div style="font-size: 42px; font-weight: bold; color: #059669; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 1px 1px 2px rgba(5, 150, 105, 0.1);">
                                    \${code}
                                </div>
                            </div>
                            
                            <p style="color: #6b7280; font-size: 13px; margin: 25px 0 0 0; line-height: 1.6;">
                                ⏰ 验证码有效期为 <strong style="color: #059669;">5 分钟</strong><br>
                                若非本人操作，请忽略此邮件
                            </p>
                        </td>
                    </tr>
                    
                    <!-- 底部 -->
                    <tr>
                        <td style="background: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #f3f4f6;">
                            <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6;">
                                此邮件由系统自动发送，请勿回复<br>
                                © 2024 fanfan-time. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- 外部提示 -->
                <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
                    如果按钮无法点击，请复制上方验证码手动输入
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
        `,
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`📧 验证码邮件已发送至 ${email}`);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`发送验证码邮件至 ${email} 失败: ${error.message}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new ServiceUnavailableException(`邮件发送失败: ${error.message}`);
    }
  }
}
