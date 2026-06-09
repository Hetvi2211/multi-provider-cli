async function withRetry(fn) {

  let retries = 3;

  while (retries > 0) {
    try {
      return await fn();

    } catch (error) {

      retries--;

      console.log(
        `Retry failed. Remaining retries: ${retries}`
      );

      if (retries === 0) {
        throw error;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 2000)
      );
    }
  }
}

module.exports = withRetry;