import { builder } from '../builder.js';
import { ActivityType, ExpenseCategory, GroupRole, SplitMode } from '../generated/prisma/enums.js';

export const SplitModeEnum = builder.enumType(SplitMode, {
  name: 'SplitMode',
  description: 'EQUAL: evenly; EXACT: amounts in minor units; PERCENT: basis points (2500 = 25%); SHARES: weights',
});
export const CategoryEnum = builder.enumType(ExpenseCategory, { name: 'ExpenseCategory' });
export const GroupRoleEnum = builder.enumType(GroupRole, { name: 'GroupRole' });
export const ActivityTypeEnum = builder.enumType(ActivityType, { name: 'ActivityType' });
