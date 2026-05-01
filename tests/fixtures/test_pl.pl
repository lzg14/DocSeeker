# DocSeeker Perl Test
use strict;
use warnings;

package DataProcessor;

sub new {
    my $class = shift;
    return bless { cache => [] }, $class;
}

sub process {
    my ($self, $data) = @_;
    push @{$self->{cache}}, uc($data);
}

package main;
print "DocSeeker Perl Test - Perl 编程语言\n";
my $processor = DataProcessor->new();
$processor->process("测试数据");
