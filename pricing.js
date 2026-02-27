// pricing.js — Логика ценообразования (обновлено под новую концепцию: "точка в маршруте")

export function calculatePackages(intent, params = {}) {
  const {
    duration = '1m',
    platforms = ['air'],
    hasCreative = false,
    videoLength = 30
  } = params;

  let base = 0;

  // Базовые цены (логика сохранена, меняем смысл/позиционирование)
  if (intent === 'placement') {
    // ВХОД: "точка в маршруте" (минимальный старт)
    base = 100000;
  } else if (intent === 'production') {
    // КОНТЕНТ: продакшн без размещения
    base = videoLength <= 30 ? 350000 : videoLength <= 60 ? 500000 : 800000;
  } else if (intent === 'film') {
    // СПЕЦПРОЕКТ / ИСТОРИЯ (короткий/длинный)
    base = videoLength <= 5 ? 800000 : 1200000;
  } else if (intent === 'combo') {
    // МАРШРУТ + УСИЛЕНИЕ: контент + вход
    const productionCost = videoLength <= 30 ? 350000 : videoLength <= 60 ? 500000 : 800000;
    const placementCost = 100000;
    base = productionCost + placementCost;
  } else {
    // Дефолт: комбо
    base = 450000;
  }

  // УРОВНИ: S/M/L (коэфы сохраняем, меняем названия и описания)
  const packages = {
    S: {
      coef: 1.0,
      name: 'Вход',
      desc: 'Появиться в маршруте: вас увидят и запомнят как “точку притяжения”'
    },
    M: {
      coef: 1.7,
      name: 'Усиление',
      desc: 'Больше контактов и повторов: закрепляем выбор, повышаем отклик'
    },
    L: {
      coef: 2.4,
      name: 'Доминирование',
      desc: 'Максимальный эффект: вы “в топе маршрута” + дополнительное усиление'
    }
  };

  // СКИДКИ (логика сохранена)
  let discount = 0;
  const discountReasons = [];

  // Скидка за связку (контент + включение)
  if (intent === 'combo' || (hasCreative && intent === 'placement')) {
    discount += 5;
    discountReasons.push('Связка “контент + включение”: -5%');
  }

  // Скидка за длительный период
  if (duration === '3m' || duration === '6m') {
    discount += 7;
    discountReasons.push('Период от 3 месяцев: -7%');
  }

  // Скидка за мультиплатформу
  if (platforms.length >= 3) {
    discount += 5;
    discountReasons.push('Несколько платформ: -5%');
  }

  discount = Math.min(discount, 15); // Максимальная скидка 15%

  // Пакеты
  const result = Object.entries(packages).map(([key, pkg]) => {
    const price = Math.round(base * pkg.coef);
    const finalPrice = Math.round(price * (1 - discount / 100));

    return {
      name: pkg.name,
      level: key,
      description: pkg.desc,
      price,
      finalPrice,
      discount,
      savings: price - finalPrice
    };
  });

  return {
    packages: result,
    discount,
    discountReasons
  };
}

export function formatPackages(packagesData) {
  const { packages, discount, discountReasons } = packagesData;

  let text = '';

  packages.forEach((pkg, i) => {
    const icon = ['🥉', '🥈', '🥇'][i];

    text += `${icon} **${pkg.name}** (${pkg.level})\n`;
    text += `${pkg.description}\n`;

    if (discount > 0) {
      text += `~~${pkg.price.toLocaleString('ru-RU')}₽~~ → **${pkg.finalPrice.toLocaleString('ru-RU')}₽**\n`;
      text += `💰 Экономия: ${pkg.savings.toLocaleString('ru-RU')}₽\n`;
    } else {
      text += `💰 **${pkg.finalPrice.toLocaleString('ru-RU')}₽**\n`;
    }

    text += '\n';
  });

  if (discount > 0 && discountReasons.length > 0) {
    text += `🎁 **Скидки применены:**\n`;
    discountReasons.forEach((r) => (text += `• ${r}\n`));
  }

  return text.trim();
}
