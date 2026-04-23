const sequelize = require('./db');
const User = require('./models/User');

async function main() {
  await sequelize.authenticate();
  console.log('Ket noi thanh cong!');

  // Tao bang neu chua co (giong mongoose.connect tu dong tao collection)
  await sequelize.sync();

  // Tao moi (giong new User({...}).save())
  const user = await User.create({ name: 'Dinh Le', email: 'test@example.com' });
  console.log('Da tao user:', user.toJSON());

  // Tim tat ca (giong User.find())
  const users = await User.findAll();
  console.log('Danh sach users:', users.map(u => u.toJSON()));

  // Tim mot (giong User.findOne())
  const found = await User.findOne({ where: { email: 'test@example.com' } });
  console.log('Tim thay:', found.toJSON());

  // Cap nhat (giong User.updateOne())
  await User.update({ name: 'Le Dinh' }, { where: { id: user.id } });

  // Xoa (giong User.deleteOne())
  await User.destroy({ where: { id: user.id } });

  await sequelize.close();
}

main().catch(console.error);
