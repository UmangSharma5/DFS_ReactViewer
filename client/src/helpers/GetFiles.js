function sortFileNames(a,b) {
    const dateA = a.date
    const dateB = b.date

    if (dateA < dateB) {
        return 1
    }
    if (dateA > dateB) {
        return -1
    }

    return 0
}

export default sortFileNames
