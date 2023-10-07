function sortFileNames(a, b) {
  if (a.hasOwnProperty('date') && b.hasOwnProperty('date')) {
    const dateA = a.date
    const dateB = b.date

    if ((dateA && !dateB) || (dateA > dateB) )
    {
      return -1
    }
    else
    {
      return 1
    }
  }

  return 0
}

export default sortFileNames
