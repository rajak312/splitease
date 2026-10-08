import { builder } from '../builder.js';

import './enums.js';
import './user.js';
import './auth.js';
import './group.js';
import './expense.js';
import './activity.js';

export const schema = builder.toSchema();
