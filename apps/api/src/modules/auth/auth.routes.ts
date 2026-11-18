import { Router } from 'express';
import { authenticate } from '../../core/auth/authenticate';
import { authRateLimit } from '../../core/auth/rate-limit';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', authRateLimit, controller.register);
authRouter.post('/login', authRateLimit, controller.login);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.post('/password/forgot', authRateLimit, controller.forgotPassword);
authRouter.post('/password/reset', authRateLimit, controller.resetPassword);

authRouter.get('/me', authenticate, controller.me);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.put('/password', authenticate, authRateLimit, controller.changePassword);
authRouter.post('/switch-company', authenticate, controller.switchCompany);
