'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { IndianRupee, CalendarDays, Receipt, BarChart3, Search } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { useHeaderStore } from '@/lib/stores/header-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface RevenueByMonthRow {
  month: string
  revenue: number
  orders: number
}

interface RevenueByCourseRow {
  courseId: string
  courseName: string
  revenue: number
  orders: number
  isActive: boolean
  isFree: boolean
}

interface RevenueDashboardData {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  currentMonthRevenue: number
  revenueByMonth: RevenueByMonthRow[]
  revenueByCourse: RevenueByCourseRow[]
}

interface CreatorsClientProps {
  initialData: RevenueDashboardData
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, (monthNumber || 1) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}

export default function CreatorsClient({ initialData }: CreatorsClientProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [courseSearch, setCourseSearch] = useState('')
  const setHeader = useHeaderStore((state) => state.setHeader)
  const clearHeader = useHeaderStore((state) => state.clearHeader)

  useEffect(() => {
    setHeader('Revenue Analytics', null)
    return () => clearHeader()
  }, [clearHeader, setHeader])

  const filteredData = useQuery(
    api.adminQueries.getRevenueDashboard,
    startDate || endDate
      ? {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      : {}
  )

  const dashboardData = filteredData ?? initialData

  const filteredCourses = useMemo(() => {
    if (!courseSearch.trim()) return dashboardData.revenueByCourse
    const query = courseSearch.trim().toLowerCase()
    return dashboardData.revenueByCourse.filter((course) =>
      course.courseName.toLowerCase().includes(query)
    )
  }, [courseSearch, dashboardData.revenueByCourse])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-3">
                <IndianRupee className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(dashboardData.totalRevenue)}</p>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-3">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboardData.totalOrders}</p>
                <p className="text-sm text-muted-foreground">Successful Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-3">
                <CalendarDays className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(dashboardData.currentMonthRevenue)}</p>
                <p className="text-sm text-muted-foreground">Current Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(Math.round(dashboardData.averageOrderValue))}</p>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date Range Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
                className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear Filter
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData.revenueByMonth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      No revenue found for this date range.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...dashboardData.revenueByMonth].reverse().map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{formatMonth(row.month)}</TableCell>
                      <TableCell className="text-right">{row.orders}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Course-wise Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search courses..."
                className="pl-10"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        No course revenue found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCourses.map((course) => (
                      <TableRow key={course.courseId}>
                        <TableCell className="font-medium">{course.courseName}</TableCell>
                        <TableCell>
                          {course.isFree ? (
                            <Badge variant="secondary">Free</Badge>
                          ) : course.isActive ? (
                            <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{course.orders}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(course.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
