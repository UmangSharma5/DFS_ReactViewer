function sortFileNames(a, b) {
  if (a.hasOwnProperty('date') && b.hasOwnProperty('date')) {
    const dateA = a.date
    const dateB = b.date

    if (a.date === null &&  b.date !== null) {
        return 1
    }
    else if (a.date !== null && b.date === null) {
        return -1
    }
    else if (a.date === null && b.date === null) {
        return 1
    }

    if (dateA < dateB) {
      return 1
    }
    if (dateA > dateB) {
      return -1
    }
  }

  return 0
}

export default sortFileNames
