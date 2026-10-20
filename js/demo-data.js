(() => {
  const dateFromToday = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  window.DemoData = {
    addTo(database, save) {
      const timestamp = Date.now();
      const [chairs, tables, lights] = [
        { id: timestamp + 1, n: 'Sillas Tiffany (prueba)', c: 'Sillas', q: 80, img: '', testData: true },
        { id: timestamp + 2, n: 'Mesas redondas (prueba)', c: 'Mesas', q: 20, img: '', testData: true },
        { id: timestamp + 3, n: 'Iluminación LED (prueba)', c: 'Iluminación', q: 12, img: '', testData: true },
      ];

      database.prods.push(chairs, tables, lights);
      database.events.push(
        {
          id: timestamp + 11,
          n: 'Boda de prueba',
          cl: 'Cliente de demostración',
          d: dateFromToday(7),
          pl: 'Salón principal',
          items: [{ p: chairs.id, q: 24 }, { p: tables.id, q: 8 }],
          st: 'pend',
          testData: true,
        },
        {
          id: timestamp + 12,
          n: 'Fiesta realizada de prueba',
          cl: 'Familia de demostración',
          d: dateFromToday(14),
          pl: 'Jardín',
          items: [{ p: chairs.id, q: 12 }, { p: lights.id, q: 4 }],
          st: 'done',
          testData: true,
        },
        {
          id: timestamp + 13,
          n: 'Cumpleaños retirado de prueba',
          cl: 'Cliente de muestra',
          d: dateFromToday(-3),
          pl: 'Casa',
          items: [{ p: chairs.id, q: 20 }, { p: tables.id, q: 4 }],
          st: 'ret',
          testData: true,
        },
      );
      database.loans.push(
        { id: timestamp + 21, who: 'Préstamo de muestra', p: chairs.id, q: 6, o: dateFromToday(-2), b: '', testData: true },
        { id: timestamp + 22, who: 'Devolución de muestra', p: tables.id, q: 2, o: dateFromToday(-12), b: dateFromToday(-6), testData: true },
      );
      save();
    },

    removeFrom(database, save) {
      database.prods = database.prods.filter((product) => !product.testData);
      database.events = database.events.filter((event) => !event.testData);
      database.loans = database.loans.filter((loan) => !loan.testData);
      save();
    },
  };
})();
